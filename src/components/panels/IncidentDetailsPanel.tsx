import { useState, useRef } from 'react';
import { AlertTriangle, Bot, MessageSquare, Calendar, User, CheckCircle2, Paperclip, X, Plus, FileText, Eye, ExternalLink, Download } from 'lucide-react';
import { AIIncident } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mockAgents } from '@/lib/mock-data';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { useApp } from '@/contexts/AppContext';

interface IncidentDetailsPanelProps {
  data: AIIncident & { onRefresh?: () => void };
}

export function IncidentDetailsPanel({ data }: IncidentDetailsPanelProps) {
  const { currentUser } = useApp();
  const [actionTaken, setActionTaken] = useState(data?.actionTaken || '');
  const [isResolving, setIsResolving] = useState(false);
  const [realFiles, setRealFiles] = useState<File[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<any[]>(data?.attachments || []);
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!data) return null;

  const agent = mockAgents.find(a => a.id === data.agentId);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Crítico</Badge>;
      case 'high':
        return <Badge className="bg-orange-600">Alto</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Médio</Badge>;
      default:
        return <Badge variant="secondary">Baixo</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge className="bg-green-600">Resolvido</Badge>;
      case 'investigating':
        return <Badge className="bg-blue-600">Investigando</Badge>;
      default:
        return <Badge variant="destructive">Aberto</Badge>;
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const selectedFiles = Array.from(files);
      setRealFiles(prev => [...prev, ...selectedFiles]);

      const newFilesMetadata = selectedFiles.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      setAttachedFiles(prev => [...prev, ...newFilesMetadata]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    // Also remove from realFiles if it was newly added
    const metadataCount = (data.attachments || []).length;
    if (index >= metadataCount) {
      setRealFiles(prev => prev.filter((_, i) => i !== (index - metadataCount)));
    }
  };

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      // 1. Upload new files if any
      const finalAttachments = [...(data.attachments || [])];

      if (realFiles.length > 0) {
        toast.info(`Fazendo upload de ${realFiles.length} arquivo(s)...`);
        for (const file of realFiles) {
          try {
            const url = await api.uploadIncidentAttachment(file);
            finalAttachments.push({
              id: Math.random().toString(36).substring(2, 11),
              name: file.name,
              size: file.size,
              type: file.type,
              url: url,
              uploadedAt: new Date()
            });
          } catch (uploadErr) {
            console.error('Upload failed for', file.name, uploadErr);
          }
        }
      }

      // 2. Call resolve API
      await api.resolveIncident(data.id, actionTaken, currentUser?.id, finalAttachments);
      toast.success('Incidente marcado como resolvido');

      // Local update
      data.status = 'resolved';
      data.resolvedAt = new Date();
      data.actionTaken = actionTaken;
      data.resolvedBy = currentUser?.id;
      data.resolverName = currentUser?.name;
      data.attachments = finalAttachments;
      setAttachedFiles(finalAttachments);
      setRealFiles([]);

      // Trigger refresh of parent component
      if (data.onRefresh) {
        data.onRefresh();
      }
    } catch (error) {
      toast.error('Erro ao resolver incidente');
      console.error(error);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 flex items-center justify-center ${data.severity === 'critical' ? 'bg-destructive/10' :
          data.severity === 'high' ? 'bg-orange-100 dark:bg-orange-950/30' :
            'bg-warning/10'
          }`}>
          <AlertTriangle className={`h-7 w-7 ${data.severity === 'critical' ? 'text-destructive' :
            data.severity === 'high' ? 'text-orange-600' :
              'text-warning'
            }`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{data.title}</h3>
          <p className="text-sm text-muted-foreground">ID: {data.id}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {getSeverityBadge(data.severity)}
        {getStatusBadge(data.status)}
      </div>

      <Separator />

      {/* Description */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Descrição</h4>
        <div className="text-sm bg-muted p-4 rounded-md space-y-3 overflow-hidden">
          {(() => {
            if (!data.description) return <span className="text-muted-foreground italic">Sem descrição.</span>;

            // Detect if there's JSON in the text (like the n8n tool output)
            const jsonMatch = data.description.match(/(\{.*\}|\[.*\])$|Detalhes:\s*(\[.*\]|\{.*\})/s);

            if (jsonMatch) {
              const textPart = data.description.substring(0, jsonMatch.index).trim();
              const jsonPart = jsonMatch[1] || jsonMatch[2];

              try {
                const parsed = JSON.parse(jsonPart);
                return (
                  <>
                    <div className="leading-relaxed whitespace-pre-wrap">{textPart}</div>
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 opacity-70">Dados Técnicos (JSON):</p>
                      <pre className="p-3 bg-background/50 rounded border border-border/40 font-mono text-[11px] overflow-x-auto">
                        {JSON.stringify(parsed, null, 2)}
                      </pre>
                    </div>
                  </>
                );
              } catch (e) {
                // Return original if JSON parsing fails
              }
            }

            // Simple Markdown Parser (Bold, Italic, Lists) + Tag detector
            const lines = data.description.split('\n');
            return lines.map((line, index) => {
              // Special case for Tags
              if (line.toLowerCase().startsWith('tags:')) {
                const tags = line.substring(5).split(',').map(t => t.trim());
                return (
                  <div key={index} className="flex flex-wrap gap-2 pt-1 border-t border-border mt-2">
                    {tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="px-1.5 py-0 text-[10px] font-mono leading-tight bg-background/50 border-dotted">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                );
              }

              // List Item
              if (line.trim().startsWith('- ')) {
                return (
                  <div key={index} className="flex gap-2 ml-2">
                    <span className="text-primary font-bold">•</span>
                    <span>
                      {line.substring(2).split(/(\*\*.*?\*\*|_.*?_)/g).map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
                        if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
                        return part;
                      })}
                    </span>
                  </div>
                );
              }

              // Normal Line
              return (
                <div key={index} className="min-h-[20px] leading-relaxed whitespace-pre-wrap">
                  {line.split(/(\*\*.*?\*\*|_.*?_)/g).map((part, i) => {
                    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
                    if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
                    return part;
                  })}
                </div>
              );
            });
          })()}
        </div>
      </div>

      <Separator />

      {/* Details */}
      <div className="grid grid-cols-1 gap-5">
        <div className="flex items-start gap-3 text-sm">
          <div className="mt-1">
            <Bot className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Agente</span>
            <span className="font-semibold text-foreground">{data.agentName || agent?.name || 'Agente desconhecido'}</span>
            <code className="text-[10px] text-muted-foreground font-mono mt-0.5">{data.agentId}</code>
          </div>
        </div>

        {data.conversationId && (
          <div className="flex items-start gap-3 text-sm">
            <div className="mt-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Conversa</span>
              <span className="font-semibold text-foreground">
                {data.userName || data.userIdentifier || 'Usuário Externo'}
              </span>
              <code className="text-[10px] text-muted-foreground font-mono mt-0.5">{data.conversationId}</code>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 text-sm">
          <div className="mt-1">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Reportado por</span>
            <span className="font-medium text-foreground italic">
              {data.reportedBy ? data.reportedBy : 'Sistema (criação automática)'}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-3 text-sm">
          <div className="mt-1">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Data de Registro</span>
            <span className="text-foreground">{data.createdAt.toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {(data.resolvedAt || data.resolverName) && (
          <div className="flex items-start gap-3 text-sm">
            <div className="mt-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Auditoria de Resolução</span>
              <span className="text-green-600 font-medium">Resolvido {data.resolvedAt && `em ${data.resolvedAt.toLocaleString('pt-BR')}`}</span>
              {data.resolverName && (
                <span className="text-sm font-semibold mt-1 flex items-center gap-1.5 grayscale opacity-80 bg-muted px-2 py-1 rounded">
                  <User className="h-3 w-3" /> {data.resolverName}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Action Taken */}
      <div className="space-y-3">
        <Label>Ação Tomada</Label>
        <Textarea
          value={actionTaken}
          onChange={(e) => setActionTaken(e.target.value)}
          placeholder="Descreva a ação tomada para resolver o incidente..."
          className="min-h-[100px]"
          disabled={data.status === 'resolved'}
        />
      </div>

      {/* Attachments UI */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Anexos
          </Label>
          {data.status !== 'resolved' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-accent/5 hover:bg-accent/10 border-accent/20"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-3 w-3 mr-1" /> Selecionar Arquivo
            </Button>
          )}
        </div>

        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
        />

        {attachedFiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {attachedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border text-xs group">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-background border border-border">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col max-w-[180px]">
                    <span className="font-medium truncate">{file.name}</span>
                    <span className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {file.url && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-accent hover:bg-accent/10"
                        onClick={() => setPreviewFile(file)}
                        title="Visualizar evidência"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => window.open(file.url, '_blank')}
                        title="Abrir em nova aba"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {data.status !== 'resolved' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded-md border border-dashed border-border text-center">
            Nenhum arquivo anexado.
          </div>
        )}
      </div>

      {/* Actions */}
      {data.status !== 'resolved' && (
        <div className="flex gap-3 pt-4">
          <Button
            className="flex-1 bg-accent hover:bg-accent/90"
            onClick={handleResolve}
            disabled={isResolving || !actionTaken}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Marcar como Resolvido
          </Button>
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> {previewFile?.name}
              </DialogTitle>
              {previewFile?.url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => window.open(previewFile.url, '_blank')}
                >
                  <Download className="h-3.5 w-3.5" /> Baixar
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/30 overflow-hidden flex items-center justify-center">
            {previewFile?.type?.includes('image') ? (
              <img
                src={previewFile.url}
                alt={previewFile.name}
                className="max-w-full max-h-full object-contain"
              />
            ) : previewFile?.type?.includes('pdf') ? (
              <iframe
                src={`${previewFile.url}#toolbar=0`}
                className="w-full h-full border-0"
                title="PDF Preview"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 text-muted-foreground p-12 text-center">
                <FileText className="h-12 w-12 opacity-20" />
                <p>Este arquivo não pode ser visualizado diretamente.<br />Use o botão de download para ver o conteúdo.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
