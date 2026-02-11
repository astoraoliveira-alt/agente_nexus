import React, { useState, useEffect } from 'react';
import { BookOpen, FileText, Trash2, Upload, AlertCircle, CheckCircle2, Loader2, FileType2, FileJson, FileType } from 'lucide-react';
import { api } from '@/services/api';
import { KnowledgeItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AgentKnowledgeTabProps {
    agentId: string;
    tenantId: string | undefined;
}

export function AgentKnowledgeTab({ agentId, tenantId }: AgentKnowledgeTabProps) {
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    useEffect(() => {
        if (agentId) {
            loadKnowledge();
        }
    }, [agentId]);

    const loadKnowledge = async () => {
        try {
            setIsLoading(true);
            const data = await api.getAgentKnowledge(agentId);
            setItems(data);
        } catch (error) {
            console.error('Error loading knowledge:', error);
            toast.error('Erro ao carregar base de conhecimento');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !tenantId) return;

        // Validation
        const allowedTypes = [
            'application/pdf',
            'text/plain',
            'application/json',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.doc') && !file.name.endsWith('.docx')) {
            toast.error('Tipo de arquivo não suportado. Use PDF, TXT, JSON ou Word.');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB
            toast.error('Arquivo muito grande. Limite de 5MB.');
            return;
        }

        try {
            setIsUploading(true);

            // Simulating text extraction for now
            const reader = new FileReader();
            reader.onload = async (event) => {
                const textContent = event.target?.result as string;

                try {
                    // Integration: Platform-side Vector Generation (Dumb Engine Alignment)
                    const embedding = await api.generateEmbedding(textContent);

                    await api.addKnowledgeItem({
                        agentId,
                        tenantId,
                        name: file.name,
                        content: textContent,
                        fileType: file.name.split('.').pop() || 'doc',
                        fileSize: file.size,
                        fileUrl: '#', // Simulated URL
                        embedding: embedding // Pre-processed vector
                    });

                    toast.success('Documento adicionado e indexado');
                    loadKnowledge();
                } catch (err) {
                    console.error(err);
                    toast.error('Erro ao processar conhecimento');
                } finally {
                    setIsUploading(false);
                }
            };

            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                // Simulated PDF extraction
                setTimeout(() => {
                    reader.onload({ target: { result: `[Extração Simulada de PDF: ${file.name}] Conteúdo denso e estruturado para o agente.` } } as any);
                }, 1500);
            } else if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
                // Simulated Word extraction
                setTimeout(() => {
                    reader.onload({ target: { result: `[Extração Simulada de Word: ${file.name}] Conteúdo do documento Word indexado para consulta.` } } as any);
                }, 1500);
            } else {
                reader.readAsText(file);
            }

        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Erro no upload');
            setIsUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir este conhecimento permanentemente?')) return;

        try {
            setIsDeleting(id);
            await api.deleteKnowledgeItem(id);
            setItems(prev => prev.filter(i => i.id !== id));
            toast.success('Documento removido');
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Erro ao remover');
        } finally {
            setIsDeleting(null);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Informative Header */}
            <div className="bg-accent/5 border border-accent/10 p-4 flex items-start gap-4">
                <div className="p-2 bg-accent/10 rounded-none border border-accent/20">
                    <BookOpen className="h-5 w-5 text-accent" />
                </div>
                <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-accent font-mono">Arquitetura de Conhecimento (RAG)</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                        Injete documentos na memória de longo prazo deste agente. O conteúdo será extraído e enviado ao n8n como contexto estruturado,
                        permitindo respostas precisas baseadas nos seus próprios dados.
                    </p>
                </div>
            </div>

            {/* Upload Zone - Extreme Geometry */}
            <div className="relative group">
                <input
                    type="file"
                    id="kb-upload"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    accept=".pdf,.txt,.json,.doc,.docx"
                />
                <label
                    htmlFor="kb-upload"
                    className={cn(
                        "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed transition-all cursor-pointer",
                        "border-border bg-muted/20 hover:bg-muted/30 hover:border-accent group-hover:border-accent/50",
                        isUploading && "opacity-50 cursor-not-allowed border-accent"
                    )}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {isUploading ? (
                            <>
                                <Loader2 className="h-8 w-18 text-accent animate-spin mb-3" />
                                <p className="text-xs font-mono uppercase tracking-widest text-accent animate-pulse">Indexando Documento...</p>
                            </>
                        ) : (
                            <>
                                <Upload className="h-8 w-8 text-muted-foreground mb-3 group-hover:text-accent transition-colors" />
                                <p className="text-sm font-bold secondary-text uppercase tracking-wider">Upload de Conhecimento</p>
                                <p className="text-[10px] text-muted-foreground mt-1">PDF, Word, TXT ou JSON (Máx 5MB)</p>
                            </>
                        )}
                    </div>
                </label>
            </div>

            {/* Items Table - Sharp/Technical Look */}
            <div className="border border-border bg-background overflow-hidden shadow-sm">
                <div className="bg-muted/50 px-4 py-2 border-b border-border flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Documentos Indexados</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{items.length} total</span>
                </div>

                {isLoading ? (
                    <div className="p-12 flex flex-col items-center gap-3">
                        <Loader2 className="h-6 w-6 text-accent animate-spin" />
                        <p className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">Consultando Base...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-12 flex flex-col items-center gap-3 opacity-50">
                        <AlertCircle className="h-8 w-8 text-muted-foreground" />
                        <p className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">Nenhum documento vinculado</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {items.map((item) => (
                            <div key={item.id} className="group hover:bg-accent/5 transition-colors p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-muted/30 border border-border flex items-center justify-center shrink-0">
                                        {item.fileType?.includes('pdf') ? (
                                            <FileType className="h-5 w-5 text-red-500" />
                                        ) : item.fileType?.includes('json') ? (
                                            <FileJson className="h-5 w-5 text-blue-500" />
                                        ) : item.fileType?.includes('doc') ? (
                                            <FileText className="h-5 w-5 text-blue-600" />
                                        ) : (
                                            <FileText className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h5 className="text-sm font-bold truncate max-w-[300px] text-foreground">{item.name}</h5>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{item.fileType || 'Doc'}</span>
                                            <span className="text-[10px] font-mono text-muted-foreground pl-3 border-l border-border">{formatSize(item.fileSize || 0)}</span>
                                            <span className="text-[10px] font-mono text-muted-foreground pl-3 border-l border-border">
                                                {item.createdAt.toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="hidden md:flex flex-col items-end mr-4">
                                        <Badge variant="outline" className="text-[9px] h-4 font-mono bg-green-500/5 text-green-500 border-green-500/20">
                                            SYNCED
                                        </Badge>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-none border border-transparent hover:border-red-500/10 transition-all"
                                        onClick={() => handleDelete(item.id)}
                                        disabled={isDeleting === item.id}
                                    >
                                        {isDeleting === item.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Context Usage Indicator */}
            <div className="p-3 border-l-2 border-accent bg-accent/5 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <p className="text-[10px] text-muted-foreground italic">
                    <strong>Integração Ativa:</strong> O n8n filtrará dinamicamente estes conteúdos para otimizar o consumo de tokens.
                </p>
            </div>
        </div>
    );
}
