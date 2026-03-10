import { useState, useRef } from 'react';
import {
  ShieldCheck, FileText, AlertTriangle, Activity,
  Search, Plus, Eye, Pencil, ExternalLink, MoreVertical, Trash2, Paperclip, X,
  Bold, Italic, List, Sparkles, Loader2
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { AIPolicy, AIIncident, IncidentAttachment, Agent } from '@/lib/types';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { useEffect } from 'react';

export default function Governance() {
  const { openSlideOver, currentTenant, currentUser } = useApp();
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // State for Policies, Incidents & Agents
  const [policies, setPolicies] = useState<AIPolicy[]>([]);
  const [incidents, setIncidents] = useState<AIIncident[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const loadData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const [incidentsData, policiesData, agentsData] = await Promise.all([
        api.getIncidents(currentTenant.id),
        api.getPolicies(currentTenant.id),
        api.getAgents(currentTenant.id)
      ]);
      setIncidents(incidentsData);
      setPolicies(policiesData);
      setAgents(agentsData);
    } catch (error) {
      toast.error('Erro ao carregar dados de governança');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentTenant]);

  // Policy Dialog State
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<AIPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<Partial<AIPolicy>>({
    name: '',
    version: '1.0',
    isActive: true,
    rules: { canDo: [], cannotDo: [], transferConditions: [] }
  });

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <Badge variant="destructive">Alto Risco</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Médio Risco</Badge>;
      default:
        return <Badge variant="secondary">Baixo Risco</Badge>;
    }
  };

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

  const getIncidentStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge className="bg-green-600">Resolvido</Badge>;
      case 'investigating':
        return <Badge className="bg-blue-600">Investigando</Badge>;
      default:
        return <Badge variant="destructive">Aberto</Badge>;
    }
  };

  const openIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const activeAgents = agents.filter(a => a.status === 'active').length;
  const highRiskAgents = agents.filter(a => a.riskLevel === 'high').length;

  const handleOpenPolicyDialog = (policy?: AIPolicy) => {
    if (policy) {
      setEditingPolicy(policy);
      setPolicyForm(policy);
    } else {
      setEditingPolicy(null);
      setPolicyForm({
        name: '',
        version: '1.0',
        isActive: true,
        rules: { canDo: [], cannotDo: [], transferConditions: [] }
      });
    }
    setIsPolicyDialogOpen(true);
  };

  const handleSavePolicy = async () => {
    if (!currentTenant) return;
    try {
      console.log('Saving policy. Editing:', !!editingPolicy, 'Form ID:', policyForm.id);

      const payload = {
        ...policyForm,
        tenantId: currentTenant.id,
        id: editingPolicy?.id || policyForm.id
      };

      if (editingPolicy) {
        await api.createPolicy(payload as AIPolicy);
        toast.success('Política atualizada');
      } else {
        await api.createPolicy({
          ...payload,
          isActive: true
        } as Partial<AIPolicy>);
        toast.success('Política criada');
      }

      // Reload
      console.log('Reloading policies...');
      const updated = await api.getPolicies(currentTenant.id);
      console.log('Received policies count:', updated.length);
      setPolicies(updated);
      setIsPolicyDialogOpen(false);
      setEditingPolicy(null);
    } catch (error) {
      console.error('Error saving policy:', error);
      toast.error('Erro ao salvar política');
    }
  };

  const handleDeletePolicy = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deletePolicy(id);
      setPolicies(prev => prev.filter(p => p.id !== id));
      toast.success('Política removida');
    } catch (error) {
      toast.error('Erro ao remover política');
    }
  };

  const handleSuggestAI = async () => {
    if (!policyForm.name) {
      toast.error('Dê um nome à política para que eu possa sugerir regras');
      return;
    }

    setIsSuggesting(true);
    try {
      const suggestions = await api.generatePolicySuggestions(policyForm.name);

      setPolicyForm(prev => ({
        ...prev,
        rules: {
          canDo: [...(prev.rules?.canDo || []), ...suggestions.canDo],
          cannotDo: [...(prev.rules?.cannotDo || []), ...suggestions.cannotDo],
          transferConditions: [...(prev.rules?.transferConditions || []), ...suggestions.transferConditions]
        }
      }));

      toast.success('Sugestões geradas com sucesso!');
    } catch (error) {
      console.error('AI Suggestion Error:', error);
      toast.error('Falha ao gerar sugestões por IA');
    } finally {
      setIsSuggesting(false);
    }
  };

  // Incident Dialog State
  const [isIncidentDialogOpen, setIsIncidentDialogOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<AIIncident | null>(null);
  const [incidentForm, setIncidentForm] = useState<Partial<AIIncident>>({
    title: '',
    description: '',
    severity: 'medium',
    status: 'open',
    agentId: '',
    attachments: [],
  });
  const [realFilesPending, setRealFilesPending] = useState<{ id: string, file: File }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const insertFormat = (format: 'bold' | 'italic' | 'list') => {
    if (!descriptionRef.current) return;

    const textarea = descriptionRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = incidentForm.description || '';

    let newText = '';
    let newCursorPos = 0;

    switch (format) {
      case 'bold':
        newText = text.substring(0, start) + '**' + text.substring(start, end) + '**' + text.substring(end);
        newCursorPos = end + 4;
        break;
      case 'italic':
        newText = text.substring(0, start) + '_' + text.substring(start, end) + '_' + text.substring(end);
        newCursorPos = end + 2;
        break;
      case 'list':
        const header = text.substring(0, start);
        const isOnNewLine = header.endsWith('\n') || header === '';
        const prefix = isOnNewLine ? '- ' : '\n- ';
        newText = text.substring(0, start) + prefix + text.substring(start, end) + text.substring(end);
        newCursorPos = end + prefix.length;
        break;
    }

    setIncidentForm(prev => ({ ...prev, description: newText }));

    // Restore focus and cursor (async to allow render)
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleOpenIncidentDialog = (incident?: AIIncident) => {
    if (incident) {
      setEditingIncident(incident);
      setIncidentForm({
        ...incident,
        attachments: incident.attachments || [], // Ensure array exists
      });
    } else {
      setEditingIncident(null);
      setIncidentForm({
        title: '',
        description: '',
        severity: 'medium',
        status: 'open',
        agentId: '',
        attachments: [],
      });
    }
    setRealFilesPending([]);
    setIsIncidentDialogOpen(true);
  };

  const handleSaveIncident = async () => {
    if (!currentTenant) return;
    try {
      const finalAttachments = [...(incidentForm.attachments || [])];

      // 1. Upload new files if any
      if (realFilesPending.length > 0) {
        toast.info(`Fazendo upload de ${realFilesPending.length} arquivo(s)...`);
        for (const item of realFilesPending) {
          if (!item.file) continue;

          try {
            const url = await api.uploadIncidentAttachment(item.file);
            // Replace the blob URL with real storage URL
            const idx = finalAttachments.findIndex(a => a.id === item.id);
            if (idx !== -1) {
              finalAttachments[idx] = {
                ...finalAttachments[idx],
                url: url
              };
            }
          } catch (uploadErr) {
            console.error('Upload failed for file:', item.id, uploadErr);
          }
        }
      }

      const payload = { ...incidentForm, attachments: finalAttachments, tenantId: currentTenant.id };
      console.log('[Governance] Saving incident payload:', payload);

      if (editingIncident) {
        await api.createIncident(payload as AIIncident);
        toast.success('Incidente atualizado');
      } else {
        await api.createIncident({
          ...payload,
          reportedBy: currentUser?.id, // Use real user ID if available
        } as Partial<AIIncident>);
        toast.success('Incidente registrado');
      }

      // Reload
      const updated = await api.getIncidents(currentTenant.id);
      setIncidents(updated);
      setIsIncidentDialogOpen(false);
      setRealFilesPending([]);
    } catch (error) {
      console.error('[Governance] Error saving incident:', error);
      toast.error('Erro ao salvar incidente');
    }
  };

  const handleDeleteIncident = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteIncident(id);
      setIncidents(prev => prev.filter(i => i.id !== id));
      toast.success('Incidente removido');
    } catch (error) {
      toast.error('Erro ao remover incidente');
    }
  };

  const handleResolveIncident = async (id: string) => {
    try {
      await api.resolveIncident(id, 'Resolvido via dashboard');
      setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved', resolvedAt: new Date() } : i));
      toast.success('Incidente resolvido');
    } catch (error) {
      toast.error('Erro ao resolver incidente');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      const newAttachments: IncidentAttachment[] = filesArray.map(file => ({
        id: `att-${Date.now()}-${Math.random()}`,
        name: file.name,
        url: URL.createObjectURL(file), // Temporary blob URL
        type: file.type || 'application/octet-stream',
        size: file.size,
        uploadedAt: new Date(),
      }));

      setIncidentForm(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...newAttachments]
      }));

      // Store real files for later upload
      setRealFilesPending(prev => [
        ...prev,
        ...newAttachments.map((att, idx) => ({ id: att.id, file: filesArray[idx] }))
      ]);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setIncidentForm(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter(a => a.id !== id)
    }));
    setRealFilesPending(prev => prev.filter(p => p.id !== id));
  };

  return (
    <MainLayout>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border flex-none">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Governança de IA</h1>
                  <p className="text-sm text-muted-foreground">Políticas, riscos e conformidade ISO</p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6">
            <TabsList>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="policies">Políticas</TabsTrigger>
              <TabsTrigger value="incidents">Incidentes</TabsTrigger>
              <TabsTrigger value="risk">Classificação de Risco</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <TabsContent value="overview" className="mt-0 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-5 w-5 text-accent" />
                  <span className="text-sm text-muted-foreground">Políticas Ativas</span>
                </div>
                <p className="text-3xl font-bold">{policies.filter(p => p.isActive).length}</p>
              </div>

              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <span className="text-sm text-muted-foreground">Incidentes Abertos</span>
                </div>
                <p className="text-3xl font-bold">{openIncidents}</p>
              </div>

              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="h-5 w-5 text-green-500" />
                  <span className="text-sm text-muted-foreground">Agentes Monitorados</span>
                </div>
                <p className="text-3xl font-bold">{activeAgents}</p>
              </div>

              <div className="kpi-card">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck className="h-5 w-5 text-destructive" />
                  <span className="text-sm text-muted-foreground">Alto Risco</span>
                </div>
                <p className="text-3xl font-bold">{highRiskAgents}</p>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Incidents */}
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Incidentes Recentes</h3>
                <div className="space-y-3">
                  {incidents.slice(0, 3).map((incident) => (
                    <div
                      key={incident.id}
                      className="flex items-start gap-3 p-3 bg-muted hover:bg-muted/80 cursor-pointer"
                      onClick={() => openSlideOver('incident-details', { ...incident, onRefresh: loadData })}
                    >
                      <AlertTriangle className={`h-4 w-4 mt-0.5 ${incident.severity === 'critical' ? 'text-destructive' :
                        incident.severity === 'high' ? 'text-orange-500' :
                          'text-warning'
                        }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{incident.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{incident.description}</p>
                        <div className="flex gap-2 mt-2">
                          {getSeverityBadge(incident.severity)}
                          {getIncidentStatusBadge(incident.status)}
                          {incident.attachments && incident.attachments.length > 0 && (
                            <Badge variant="outline" className="text-xs text-muted-foreground flex gap-1 items-center">
                              <Paperclip className="h-3 w-3" />
                              {incident.attachments.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Policies */}
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Políticas Ativas</h3>
                <div className="space-y-3">
                  {policies.filter(p => p.isActive).map((policy) => (
                    <div
                      key={policy.id}
                      className="flex items-start gap-3 p-3 bg-muted hover:bg-muted/80 cursor-pointer"
                      onClick={() => openSlideOver('policy-details', policy)}
                    >
                      <FileText className="h-4 w-4 mt-0.5 text-accent" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{policy.name}</p>
                          <Badge variant="outline" className="text-[10px]">v{policy.version}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {policy.rules.canDo.length} permissões • {policy.rules.cannotDo.length} restrições
                        </p>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="policies" className="mt-0 space-y-4">
            <div className="flex justify-between items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar políticas..." className="pl-10" />
              </div>
              <Button className="bg-accent hover:bg-accent/90" onClick={() => handleOpenPolicyDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Política
              </Button>
            </div>

            <div className="grid gap-4">
              {policies.map((policy) => (
                <div key={policy.id} className="kpi-card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{policy.name}</h3>
                          <Badge variant="outline">v{policy.version}</Badge>
                          {policy.isActive ? (
                            <Badge className="bg-green-600">Ativa</Badge>
                          ) : (
                            <Badge variant="secondary">Inativa</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Criada em {policy.createdAt.toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openSlideOver('policy-details', policy)}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenPolicyDialog(policy)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={(e) => handleDeletePolicy(policy.id, e)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">Pode fazer</p>
                      <p className="text-2xl font-bold text-green-600">{policy.rules.canDo.length}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">Não pode</p>
                      <p className="text-2xl font-bold text-red-600">{policy.rules.cannotDo.length}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-3">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Transferir se</p>
                      <p className="text-2xl font-bold text-blue-600">{policy.rules.transferConditions.length}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Policy Dialog */}
            <Dialog open={isPolicyDialogOpen} onOpenChange={setIsPolicyDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingPolicy ? 'Editar Política' : 'Nova Política'}</DialogTitle>
                  <DialogDescription>
                    Defina as regras e diretrizes de governança para os agentes de IA.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 overflow-y-auto max-h-[70vh] px-1">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={policyForm.name} onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} placeholder="Ex: Política de Privacidade e Ética" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Versão</Label>
                      <Input value={policyForm.version} onChange={(e) => setPolicyForm({ ...policyForm, version: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={policyForm.isActive ? 'active' : 'inactive'}
                        onValueChange={(v) => setPolicyForm({ ...policyForm, isActive: v === 'active' })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativa</SelectItem>
                          <SelectItem value="inactive">Inativa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        Regras de Comportamento
                      </Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 border-accent/30 hover:border-accent hover:bg-accent/10"
                        onClick={handleSuggestAI}
                        disabled={isSuggesting}
                      >
                        {isSuggesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-accent" />
                        )}
                        Sugerir por IA
                      </Button>
                    </div>

                    {/* Can Do */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-green-600 font-bold uppercase tracking-wider text-[10px]">O que a IA PODE fazer</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] bg-green-500/10 hover:bg-green-500/20 text-green-600"
                          onClick={() => setPolicyForm({
                            ...policyForm,
                            rules: {
                              ...policyForm.rules!,
                              canDo: [...(policyForm.rules?.canDo || []), '']
                            }
                          })}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Adicionar
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {policyForm.rules?.canDo.map((rule, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Input
                              value={rule}
                              onChange={(e) => {
                                const newRules = [...policyForm.rules!.canDo];
                                newRules[idx] = e.target.value;
                                setPolicyForm({
                                  ...policyForm,
                                  rules: { ...policyForm.rules!, canDo: newRules }
                                });
                              }}
                              placeholder="Ex: Pode emitir faturas"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => {
                                const newRules = policyForm.rules!.canDo.filter((_, i) => i !== idx);
                                setPolicyForm({
                                  ...policyForm,
                                  rules: { ...policyForm.rules!, canDo: newRules }
                                });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Cannot Do */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-destructive font-bold uppercase tracking-wider text-[10px]">O que a IA NÃO PODE fazer</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-600"
                          onClick={() => setPolicyForm({
                            ...policyForm,
                            rules: {
                              ...policyForm.rules!,
                              cannotDo: [...(policyForm.rules?.cannotDo || []), '']
                            }
                          })}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Adicionar
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {policyForm.rules?.cannotDo.map((rule, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Input
                              value={rule}
                              onChange={(e) => {
                                const newRules = [...policyForm.rules!.cannotDo];
                                newRules[idx] = e.target.value;
                                setPolicyForm({
                                  ...policyForm,
                                  rules: { ...policyForm.rules!, cannotDo: newRules }
                                });
                              }}
                              placeholder="Ex: Não pode dar descontos > 10%"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => {
                                const newRules = policyForm.rules!.cannotDo.filter((_, i) => i !== idx);
                                setPolicyForm({
                                  ...policyForm,
                                  rules: { ...policyForm.rules!, cannotDo: newRules }
                                });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Transfer Conditions */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-blue-600 font-bold uppercase tracking-wider text-[10px]">Quando TRANSFERIR para Humano</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-600"
                          onClick={() => setPolicyForm({
                            ...policyForm,
                            rules: {
                              ...policyForm.rules!,
                              transferConditions: [...(policyForm.rules?.transferConditions || []), '']
                            }
                          })}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Adicionar
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {policyForm.rules?.transferConditions.map((rule, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Input
                              value={rule}
                              onChange={(e) => {
                                const newRules = [...policyForm.rules!.transferConditions];
                                newRules[idx] = e.target.value;
                                setPolicyForm({
                                  ...policyForm,
                                  rules: { ...policyForm.rules!, transferConditions: newRules }
                                });
                              }}
                              placeholder="Ex: O cliente usar linguagem ofensiva"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => {
                                const newRules = policyForm.rules!.transferConditions.filter((_, i) => i !== idx);
                                setPolicyForm({
                                  ...policyForm,
                                  rules: { ...policyForm.rules!, transferConditions: newRules }
                                });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button variant="outline" onClick={() => setIsPolicyDialogOpen(false)}>Cancelar</Button>
                    <Button className="bg-accent hover:bg-accent/90" onClick={handleSavePolicy}>
                      {editingPolicy ? 'Salvar Alterações' : 'Criar Política'}
                    </Button>
                  </div>
                </div>

              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="incidents" className="mt-0 space-y-4">
            <div className="flex justify-between items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar incidentes..." className="pl-10" />
              </div>
              <Button className="bg-accent hover:bg-accent/90" onClick={() => handleOpenIncidentDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Registrar Incidente
              </Button>
            </div>

            <div className="kpi-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Incidente</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agente</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Severidade</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Data</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((incident) => {
                    const agent = agents.find(a => a.id === incident.agentId);
                    return (
                      <tr
                        key={incident.id}
                        className="border-b border-border hover:bg-muted/50 cursor-pointer"
                        onClick={() => openSlideOver('incident-details', { ...incident, onRefresh: loadData })}
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium">{incident.title}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{incident.description}</p>
                          {incident.attachments && incident.attachments.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 flex gap-1">
                                <Paperclip className="h-2.5 w-2.5" />
                                {incident.attachments.length}
                              </Badge>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">{agent?.name || '-'}</td>
                        <td className="py-3 px-4">{getSeverityBadge(incident.severity)}</td>
                        <td className="py-3 px-4">{getIncidentStatusBadge(incident.status)}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {incident.createdAt.toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {incident.status !== 'resolved' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenIncidentDialog(incident); }}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleResolveIncident(incident.id); }}>
                                  <Activity className="h-4 w-4 mr-2" />
                                  Resolver
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={(e) => handleDeleteIncident(incident.id, e)}>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Incident Dialog */}
            <Dialog open={isIncidentDialogOpen} onOpenChange={setIsIncidentDialogOpen}>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingIncident ? 'Editar Incidente' : 'Novo Incidente'}</DialogTitle>
                  <DialogDescription>
                    Registre os detalhes e evidências do incidente de IA para auditoria.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })} placeholder="Resumo do problema" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição Detalhada</Label>
                    <div className="border border-input rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <div className="flex items-center gap-1 p-1 border-b border-border bg-muted/20">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => insertFormat('bold')}
                          title="Negrito (Markdown)"
                          type="button"
                        >
                          <Bold className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => insertFormat('italic')}
                          title="Itálico (Markdown)"
                          type="button"
                        >
                          <Italic className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => insertFormat('list')}
                          title="Lista (Markdown)"
                          type="button"
                        >
                          <List className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        ref={descriptionRef}
                        value={incidentForm.description}
                        onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                        placeholder="Descreva o incidente detalhadamente. Suporta Markdown basico (**negrito**, _itálico_, - lista)."
                        className="min-h-[150px] border-0 focus-visible:ring-0 resize-y rounded-t-none font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Agente Relacionado</Label>
                      <Select
                        value={incidentForm.agentId}
                        onValueChange={(v) => setIncidentForm({ ...incidentForm, agentId: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Severidade</Label>
                      <Select
                        value={incidentForm.severity}
                        onValueChange={(v: any) => setIncidentForm({ ...incidentForm, severity: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="critical">Crítica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label>Status do Incidente</Label>
                      <Select
                        value={incidentForm.status}
                        onValueChange={(v: any) => setIncidentForm({ ...incidentForm, status: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Aberto</SelectItem>
                          <SelectItem value="investigating">Em Investigação</SelectItem>
                          <SelectItem value="resolved">Resolvido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Attachments Section */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="flex justify-between items-center">
                      <Label>Evidências e Anexos</Label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={handleFileSelect}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-3 w-3 mr-2" />
                        Adicionar Arquivo
                      </Button>
                    </div>

                    {incidentForm.attachments && incidentForm.attachments.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 bg-muted/30 p-2 rounded-md">
                        {incidentForm.attachments.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-2 bg-background border border-border rounded text-sm relative group">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                              <span className="truncate max-w-[200px]">{file.name}</span>
                              <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)}KB)</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleRemoveAttachment(file.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-muted/20 border border-dashed border-border rounded-md">
                        <p className="text-xs text-muted-foreground">Nenhum anexo adicionado</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setIsIncidentDialogOpen(false)}>Cancelar</Button>
                    <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleSaveIncident}>
                      {editingIncident ? 'Salvar Incidente' : 'Registrar Incidente'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="risk" className="mt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => {
                return (
                  <div
                    key={agent.id}
                    className="kpi-card cursor-pointer hover:shadow-lg transition-all"
                    onClick={() => openSlideOver('agent-governance', {
                      governance: {
                        agentId: agent.id,
                        riskLevel: agent.riskLevel || 'low',
                        usageType: agent.type || 'conversational',
                        autonomyLevel: agent.autonomyLevel || 1,
                        policies: agent.applied_policies || [],
                        lifecycleStage: agent.lifecycleStage || 'development'
                      },
                      agent
                    })}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold">{agent.name}</h3>
                        <p className="text-xs text-muted-foreground">{agent.id}</p>
                      </div>
                      {getRiskBadge(agent.riskLevel || 'low')}
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Tipo de Uso</span>
                        <Badge variant="outline" className="capitalize">{agent.type}</Badge>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Autonomia</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div
                              key={level}
                              className={`w-4 h-4 ${(agent.autonomyLevel || 1) >= level ? 'bg-accent' : 'bg-muted'}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Políticas</span>
                        <span className="text-sm font-medium">{(agent.applied_policies || []).length} vinculadas</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </MainLayout>
  );
}
