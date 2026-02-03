import { useState, useEffect } from 'react';
import {
  Workflow, Plus, Search, ArrowRight,
  Phone, MessageSquare, CheckCircle2, TrendingUp, Clock, Users,
  MoreVertical, Pencil, Trash2, Info, Lightbulb, UserCheck, Bot,
  Settings2, GripVertical, PlusCircle, X
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useApp } from '@/contexts/AppContext';
import { mockSuccessMetrics } from '@/lib/mock-extended-data';
import { ConversationalFlow, FlowStageType, FlowStage, Agent } from '@/lib/types';
import { toast } from 'sonner';
import { api } from '@/services/api';

export default function Flows() {
  const { openSlideOver, currentTenant } = useApp();
  const [activeTab, setActiveTab] = useState('flows');
  const [search, setSearch] = useState('');

  // Data State
  const [flows, setFlows] = useState<ConversationalFlow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ConversationalFlow | null>(null);

  const [formData, setFormData] = useState<Partial<ConversationalFlow>>({
    name: '',
    description: '',
    type: 'inbound',
    objective: '',
    status: 'active',
    stages: [],
    linked_agents: [],
    success_criteria: '',
  });

  const [activeDialogTab, setActiveDialogTab] = useState('general');

  // Load Data
  useEffect(() => {
    async function loadData() {
      if (currentTenant) {
        try {
          const [flowsData, agentsData] = await Promise.all([
            api.getFlows(currentTenant.id),
            api.getAgents(currentTenant.id)
          ]);
          setFlows(flowsData);
          setAgents(agentsData);
        } catch (error) {
          console.error(error);
          toast.error("Erro ao carregar dados dos fluxos");
        }
      }
    }
    loadData();
  }, [currentTenant]);

  const filteredFlows = flows.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenDialog = (flow?: ConversationalFlow) => {
    setActiveDialogTab('general');
    if (flow) {
      setEditingFlow(flow);
      setFormData({ ...flow });
    } else {
      setEditingFlow(null);
      setFormData({
        name: '',
        description: '',
        type: 'inbound',
        objective: '',
        status: 'active',
        stages: [],
        linked_agents: [],
        success_criteria: 'Meta de conversão atingida',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.objective) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    if (!currentTenant) return;

    try {
      if (editingFlow) {
        // Update
        const updated = await api.updateFlow(editingFlow.id, formData);
        setFlows(prev => prev.map(f => f.id === updated.id ? updated : f));
        toast.success('Contrato de fluxo atualizado');
      } else {
        // Create
        const newFlowRef: Partial<ConversationalFlow> = {
          ...formData,
          tenant_id: currentTenant.id
        };
        const created = await api.createFlow(newFlowRef);
        setFlows(prev => [...prev, created]);
        toast.success('Novo contrato de fluxo criado');
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar fluxo');
    }
  };

  const getStageIcon = (type: FlowStageType) => {
    switch (type) {
      case 'greeting': return <span className="text-lg">👋</span>;
      case 'qualification': return <span className="text-lg">🔍</span>;
      case 'resolution': return <span className="text-lg">✅</span>;
      case 'handoff': return <span className="text-lg">🔄</span>;
      case 'closing': return <span className="text-lg">🏁</span>;
      default: return <span className="text-lg">📍</span>;
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlows(prev => prev.filter(f => f.id !== id));
    toast.success('Fluxo removido');
  };

  const addStage = () => {
    const newStage: FlowStage = {
      id: `st-${Date.now()}`,
      order: (formData.stages?.length || 0) + 1,
      name: 'Nova Etapa',
      type: 'greeting',
      description: '',
      expected_outcome: '',
      escalation_allowed: false,
      actor_type: 'ai'
    };
    setFormData({ ...formData, stages: [...(formData.stages || []), newStage] });
  };

  const removeStage = (id: string) => {
    setFormData({
      ...formData,
      stages: formData.stages?.filter(s => s.id !== id).map((s, idx) => ({ ...s, order: idx + 1 }))
    });
  };

  const updateStage = (id: string, updates: Partial<FlowStage>) => {
    setFormData({
      ...formData,
      stages: formData.stages?.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const toggleAgent = (agentId: string) => {
    const current = formData.linked_agents || [];
    if (current.includes(agentId)) {
      setFormData({ ...formData, linked_agents: current.filter(id => id !== agentId) });
    } else {
      setFormData({ ...formData, linked_agents: [...current, agentId] });
    }
  };

  const getActorColor = (actor: 'ai' | 'human' | 'both') => {
    switch (actor) {
      case 'ai': return 'bg-green-500';
      case 'human': return 'bg-red-500';
      case 'both': return 'bg-amber-500';
    }
  };

  return (
    <MainLayout>
      <TooltipProvider>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b border-border flex-none">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center">
                    <Workflow className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Contratos de Jornada Conversacional</h1>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">Governança estratégica de diálogos e objetivos de negócio</p>
                      <Badge variant="outline" className="text-[10px] h-4 py-0 border-accent/30 text-accent bg-accent/5 font-bold">ESTRATÉGICO</Badge>
                    </div>
                  </div>
                </div>
                <Button className="bg-accent hover:bg-accent/90" onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Fluxo
                </Button>
              </div>
            </div>

            <div className="px-6 pb-4">
              <div className="bg-accent/5 border border-accent/10 p-4 flex items-start gap-4 rounded-sm shadow-sm">
                <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Lightbulb className="h-5 w-5 text-accent" />
                </div>
                <div className="text-xs space-y-1.5 flex-1">
                  <p className="font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                    💡 Princípio do Nexus: O Contrato de Jornada
                  </p>
                  <p className="text-muted-foreground leading-relaxed text-[11px]">
                    Este contrato define **o que deve acontecer** na conversa (intenção, ordem e metas), e não **como** executar tecnicamente.
                    Cada etapa gera um **Evento de Jornada** que o Agente envia para o N8N interpretar e executar as ações necessárias (como consultas em APIs ou CRMs).
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6">
              <TabsList>
                <TabsTrigger value="flows">Visualização de Jornadas</TabsTrigger>
                <TabsTrigger value="metrics">Métricas de Contrato</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="flows" className="mt-0 space-y-6">
              {/* Search */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar fluxos por nome ou objetivo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>

              {/* Flows Grid */}
              <div className="grid grid-cols-1 gap-6">
                {filteredFlows.map((flow) => {
                  const linkedAgents = (flow.linked_agents || []).map(id => agents.find(a => a.id === id)).filter(Boolean);
                  const metrics = mockSuccessMetrics.byFlow.find(m => m.flowId === flow.id);

                  return (
                    <div
                      key={flow.id}
                      className="bg-background border border-border flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border hover:border-accent/40 cursor-pointer transition-all group overflow-hidden"
                      onClick={() => openSlideOver('flow-details', { flow, metrics, onEdit: () => handleOpenDialog(flow) })}
                    >
                      {/* Left Sidebar Info */}
                      <div className="md:w-64 p-5 bg-muted/30 border-r border-border flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            {flow.type === 'outbound' ? (
                              <Badge className="bg-purple-600 h-5 text-[10px]">Outbound</Badge>
                            ) : (
                              <Badge variant="secondary" className="h-5 text-[10px]">Inbound</Badge>
                            )}
                            <div className={`w-2 h-2 rounded-full ${flow.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                          </div>
                          <h3 className="font-bold text-lg mb-1 leading-tight">{flow.name}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-4">{flow.description}</p>

                          <div className="space-y-3 pb-4">
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Objetivo</Label>
                              <p className="text-xs font-medium">{flow.objective}</p>
                            </div>
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Agentes Vinculados</Label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {linkedAgents.map(a => (
                                  <Badge key={a?.id} variant="outline" className="text-[9px] py-0">{a?.name}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-border flex items-center justify-between">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDialog(flow); }}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar Contrato
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                <Workflow className="h-4 w-4 mr-2" />
                                Exportar p/ N8N (JSON)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={(e) => handleDelete(flow.id, e)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remover Fluxo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] h-7 gap-1 hover:bg-accent hover:text-white"
                            onClick={(e) => { e.stopPropagation(); handleOpenDialog(flow); }}
                          >
                            Configurar <Settings2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Right Content - Journey Line (Requirement 3.2.B) */}
                      <div className="flex-1 p-6 relative">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-1.5">
                            <Info className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Linha da Jornada Conversacional</span>
                          </div>
                          <div className="flex items-center gap-4 text-[9px] uppercase font-bold text-muted-foreground/60">
                            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> IA Sozinha</div>
                            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Supervisão</div>
                            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> Humano Obrig.</div>
                          </div>
                        </div>

                        <div className="relative flex items-center justify-between mt-10 px-4">
                          {/* Main Rail Line */}
                          <div className="absolute left-0 right-0 h-0.5 bg-border top-1/2 -translate-y-1/2 z-0" />

                          {flow.stages.map((stage, idx) => (
                            <div key={stage.id} className="relative z-10 flex flex-col items-center">
                              {/* Step Node */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 border-background shadow-md transition-all hover:scale-110 ${getActorColor(stage.actor_type)}`}>
                                    <div className="bg-background/90 w-8 h-8 rounded-full flex items-center justify-center">
                                      {getStageIcon(stage.type)}
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="p-3 max-w-xs space-y-2">
                                  <div className="flex items-center justify-between gap-4">
                                    <p className="font-bold text-sm uppercase">{stage.name}</p>
                                    <Badge variant="outline" className="text-[9px] h-4 py-0">{stage.type}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{stage.description}</p>
                                  <div className="pt-2 border-t border-border">
                                    <p className="text-[9px] font-bold uppercase text-muted-foreground mb-1">Resultado Esperado:</p>
                                    <p className="text-[10px] italic">{stage.expected_outcome}</p>
                                  </div>
                                  {stage.escalation_allowed && (
                                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[8px] h-4">Escalonamento Ativo</Badge>
                                  )}
                                </TooltipContent>
                              </Tooltip>

                              <div className="mt-3 text-center">
                                <p className="text-[10px] font-bold uppercase leading-none mb-1">{stage.name}</p>
                                <div className="flex items-center justify-center gap-1">
                                  {stage.actor_type === 'ai' || stage.actor_type === 'both' ? <Bot className="h-3 w-3 text-muted-foreground" /> : null}
                                  {stage.actor_type === 'human' || stage.actor_type === 'both' ? <UserCheck className="h-3 w-3 text-muted-foreground" /> : null}
                                </div>
                              </div>

                              {/* Path Link label if needed, or index */}
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-muted px-2 py-0.5 rounded-full border border-border">
                                <span className="text-[8px] font-mono font-bold">0{idx + 1}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Rail Metrics Footer */}
                        {metrics && (
                          <div className="mt-16 flex items-center justify-end gap-6 pt-4 border-t border-dashed border-border">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] font-bold text-muted-foreground/70 uppercase">Taxa de Conclusão</span>
                                  <span className="text-xl font-bold font-mono text-accent">{metrics.successRate.toFixed(0)}%</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Origem: <code>flow.completed.success</code> / total</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] font-bold text-muted-foreground/70 uppercase">Tempo médio na Jornada</span>
                                  <span className="text-lg font-bold font-mono">{(metrics.avgCompletionTime / 60).toFixed(1)}m</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Cálculo: <code>flow.started</code> → <code>flow.completed</code></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] font-bold text-muted-foreground/70 uppercase">Intervenção Humana</span>
                                  <span className="text-lg font-bold font-mono text-red-600">{metrics.humanInterventionRate.toFixed(0)}%</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Origem: <code>handoff.triggered</code></TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="mt-0 space-y-6">
              {/* Global KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="kpi-card border-none bg-green-50/30 dark:bg-green-950/20">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-green-700 dark:text-green-400 font-bold uppercase">Taxa de Sucesso Geral</span>
                  </div>
                  <p className="text-3xl font-bold tracking-tighter text-green-600">{mockSuccessMetrics.overallSuccessRate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {mockSuccessMetrics.successfulConversations.toLocaleString()} jornadas concluídas
                  </p>
                </div>

                <div className="kpi-card border-none bg-blue-50/30 dark:bg-blue-950/20">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="h-5 w-5 text-blue-500" />
                    <span className="text-sm text-blue-700 dark:text-blue-400 font-bold uppercase">Time-to-Resolution</span>
                  </div>
                  <p className="text-3xl font-bold tracking-tighter">{(mockSuccessMetrics.avgTimeToResolution / 60).toFixed(1)}m</p>
                  <p className="text-xs text-muted-foreground mt-1">média por fluxo ativo</p>
                </div>

                <div className="kpi-card border-none bg-orange-50/30 dark:bg-orange-950/20">
                  <div className="flex items-center gap-3 mb-2">
                    <Users className="h-5 w-5 text-orange-500" />
                    <span className="text-sm text-orange-700 dark:text-orange-400 font-bold uppercase">Escalonamentos</span>
                  </div>
                  <p className="text-3xl font-bold tracking-tighter">{mockSuccessMetrics.humanInterventions.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((mockSuccessMetrics.humanInterventions / mockSuccessMetrics.totalConversations) * 100).toFixed(1)}% das conversas
                  </p>
                </div>

                <div className="kpi-card border-none bg-accent/5">
                  <div className="flex items-center gap-3 mb-2">
                    <TrendingUp className="h-5 w-5 text-accent" />
                    <span className="text-sm text-accent font-bold uppercase">Total Volumetria</span>
                  </div>
                  <p className="text-3xl font-bold tracking-tighter">{mockSuccessMetrics.totalConversations.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">{mockSuccessMetrics.period}</p>
                </div>
              </div>

              {/* Metrics by Flow */}
              <div className="kpi-card">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg uppercase tracking-tight">Desempenho por Contrato de Fluxo</h3>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> Atualizado em tempo real (Mocked Events)
                  </div>
                </div>
                <div className="space-y-4">
                  {mockSuccessMetrics.byFlow.map((flowMetrics) => {
                    return (
                      <div key={flowMetrics.flowId} className="p-5 bg-muted/20 border border-border/50 rounded-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="font-bold text-base">{flowMetrics.flowName}</h4>
                            <p className="text-xs text-muted-foreground">
                              {flowMetrics.totalConversations.toLocaleString()} jornadas iniciadas no período
                            </p>
                          </div>
                          <div className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <p className="text-xl font-bold text-accent leading-none font-mono">{flowMetrics.successRate}%</p>
                                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Meta atingida</p>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Evento: <code>flow.completed.success</code></TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <Progress value={flowMetrics.successRate} className="h-2 rounded-none bg-muted" />
                          </div>

                          <div className="grid grid-cols-3 gap-6 text-sm">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="bg-background/50 p-2 border border-border/40 cursor-help">
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Duração Média</span>
                                  <span className="font-mono font-bold">{(flowMetrics.avgCompletionTime / 60).toFixed(1)}min</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Tempo entre <code>started</code> e <code>completed</code></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="bg-background/50 p-2 border border-border/40 cursor-help">
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Transbordos</span>
                                  <span className="font-mono font-bold">{flowMetrics.humanInterventions.toLocaleString()}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Evento: <code>handoff.triggered</code></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="bg-background/50 p-2 border border-border/40 cursor-help">
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Índice Interv.</span>
                                  <span className="font-mono font-bold">{flowMetrics.humanInterventionRate}%</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Proporção de conversas que exigiram atuação humana</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </div>

          {/* CONFIGURATOR DIALOG (STAGES & AGENTS) */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
              <DialogHeader className="p-6 pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent/10 flex items-center justify-center rounded-sm">
                    <Settings2 className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <DialogTitle>{editingFlow ? 'Configurar Contrato de Jornada' : 'Novo Contrato de Fluxo'}</DialogTitle>
                    <p className="text-xs text-muted-foreground">Isolamento de jornada e regras de orquestração para Agentes e N8N.</p>
                  </div>
                </div>
                <div className="mt-4 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-sm flex gap-2">
                  <Settings2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-tight">
                    <strong>Contrato de Execução:</strong> Este fluxo é lido em tempo real pelo N8N a cada passo da conversa.
                    Alterações nas etapas ou regras de escalonamento afetam imediatamente a lógica de todos os agentes vinculados.
                  </p>
                </div>
              </DialogHeader>

              <Tabs value={activeDialogTab} onValueChange={setActiveDialogTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 border-b border-border">
                  <TabsList className="bg-transparent border-none p-0 h-12 gap-6">
                    <TabsTrigger value="general" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-0 h-1full">Geral</TabsTrigger>
                    <TabsTrigger value="stages" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-0 h-full flex gap-2">
                      Jornada (Stages) <Badge variant="secondary" className="h-4 px-1 text-[9px]">{formData.stages?.length || 0}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="agents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-0 h-full flex gap-2">
                      Agentes Vinculados <Badge variant="secondary" className="h-4 px-1 text-[9px]">{formData.linked_agents?.length || 0}</Badge>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-6">
                    <TabsContent value="general" className="mt-0 space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground">Nome do Fluxo</Label>
                            <Input
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              placeholder="Ex: Suporte Técnico L1"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground">Objetivo Estratégico</Label>
                            <Input
                              value={formData.objective}
                              onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                              placeholder="Qual o resultado final esperado?"
                              className="h-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground">Descrição (Privada)</Label>
                            <Textarea
                              value={formData.description}
                              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                              placeholder="Detalhes sobre a jornada para auditoria corporativa"
                              className="min-h-[100px] resize-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <Label className="text-xs uppercase font-bold text-muted-foreground">Direção</Label>
                          <Select
                            value={formData.type}
                            onValueChange={(v: any) => setFormData({ ...formData, type: v })}
                          >
                            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inbound">Inbound (Usuario inicia)</SelectItem>
                              <SelectItem value="outbound">Outbound (IA inicia)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs uppercase font-bold text-muted-foreground">Status</Label>
                          <Select
                            value={formData.status}
                            onValueChange={(v: any) => setFormData({ ...formData, status: v })}
                          >
                            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Ativo (Produção)</SelectItem>
                              <SelectItem value="inactive">Inativo (Offline)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs uppercase font-bold text-muted-foreground">Sucesso (JSON Event)</Label>
                          <Input
                            value={formData.success_criteria}
                            onChange={(e) => setFormData({ ...formData, success_criteria: e.target.value })}
                            placeholder="Ex: flow.completed.success"
                            className="h-10 font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="stages" className="mt-0 space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-xs text-muted-foreground">Lógica linear de progressão e atores.</div>
                        <Button variant="outline" size="sm" className="h-8 gap-2 border-accent text-accent hover:bg-accent/5" onClick={addStage}>
                          <PlusCircle className="h-3.5 w-3.5" /> Adicionar Estágio
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {formData.stages?.map((stage, idx) => (
                          <div key={stage.id} className="p-4 bg-muted/30 border border-border rounded-sm group relative">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0 pt-2 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground">
                                <GripVertical className="h-5 w-5" />
                              </div>
                              <div className="flex-1 grid grid-cols-12 gap-4">
                                <div className="col-span-1 flex flex-col justify-center">
                                  <span className="text-xl font-mono font-bold text-muted-foreground/30">0{idx + 1}</span>
                                </div>
                                <div className="col-span-3 space-y-1">
                                  <Label className="text-[9px] uppercase font-bold">Nome & Tipo</Label>
                                  <Input
                                    value={stage.name}
                                    onChange={(e) => updateStage(stage.id, { name: e.target.value })}
                                    className="h-8 text-xs font-bold"
                                  />
                                  <Select value={stage.type} onValueChange={(v: any) => updateStage(stage.id, { type: v })}>
                                    <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="greeting">Saudação</SelectItem>
                                      <SelectItem value="qualification">Qualificação</SelectItem>
                                      <SelectItem value="resolution">Resolução</SelectItem>
                                      <SelectItem value="handoff">Handoff</SelectItem>
                                      <SelectItem value="closing">Encerramento</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-4 space-y-1">
                                  <Label className="text-[9px] uppercase font-bold">Descrição da Tarefa</Label>
                                  <Textarea
                                    value={stage.description}
                                    onChange={(e) => updateStage(stage.id, { description: e.target.value })}
                                    className="min-h-[64px] text-xs resize-none"
                                  />
                                </div>
                                <div className="col-span-4 space-y-1">
                                  <Label className="text-[9px] uppercase font-bold text-accent">Controle & Resultado</Label>
                                  <div className="flex gap-2">
                                    <Select value={stage.actor_type} onValueChange={(v: any) => updateStage(stage.id, { actor_type: v })}>
                                      <SelectTrigger className="h-7 text-[10px] w-full"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ai">IA (Plena)</SelectItem>
                                        <SelectItem value="both">IA Supervisionada</SelectItem>
                                        <SelectItem value="human">Transferência Humana</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Input
                                    value={stage.expected_outcome}
                                    onChange={(e) => updateStage(stage.id, { expected_outcome: e.target.value })}
                                    placeholder="Resultado Esperado (Evento)"
                                    className="h-8 text-[10px] bg-background"
                                  />
                                  <div className="pt-1">
                                    <Label className="text-[8px] uppercase font-bold text-orange-600">Regra de Escala (N8N Trigger)</Label>
                                    <Input
                                      value={stage.escalation_rule || ''}
                                      onChange={(e) => updateStage(stage.id, { escalation_rule: e.target.value })}
                                      placeholder="Ex: transfer_se_erro_3x"
                                      className="h-7 text-[9px] border-orange-200 bg-orange-50/20"
                                    />
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
                                onClick={() => removeStage(stage.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}

                        {(!formData.stages || formData.stages.length === 0) && (
                          <div className="py-12 border-2 border-dashed border-border rounded-sm flex flex-col items-center justify-center text-muted-foreground">
                            <Workflow className="h-10 w-10 mb-2 opacity-20" />
                            <p className="text-sm">Nenhum estágio definido para esta jornada.</p>
                            <Button variant="link" onClick={addStage}>Adicionar primeiro estágio</Button>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="agents" className="mt-0 space-y-6">
                      <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-sm">
                        <h5 className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-2">
                          <Info className="h-3.5 w-3.5" /> Arquitetura de Execução
                        </h5>
                        <div className="grid grid-cols-3 gap-4 text-[10px] leading-relaxed">
                          <div className="p-2 border border-blue-100 bg-white/50">
                            <span className="font-bold block mb-1">1. O CONTRATO (Fluxo)</span>
                            Define a estrada. Não possui endpoints técnicos.
                          </div>
                          <div className="p-2 border border-blue-100 bg-white/50">
                            <span className="font-bold block mb-1">2. O EXECUTOR (Agente)</span>
                            Quem percorre a estrada. Posee o link N8N único.
                          </div>
                          <div className="p-2 border border-blue-100 bg-white/50">
                            <span className="font-bold block mb-1">3. O CÉREBRO (N8N)</span>
                            Orquestra as ações baseadas no evento de jornada.
                          </div>
                        </div>
                        <p className="mt-3 text-[10px] text-blue-600 font-medium italic">
                          Nota: O link do N8N é configurado no Agente, não no Fluxo. Atribua os agentes abaixo:
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {agents.map((agent) => (
                          <div
                            key={agent.id}
                            className={`p-3 border rounded-sm flex items-center justify-between cursor-pointer transition-colors ${formData.linked_agents?.includes(agent.id)
                              ? 'bg-accent/5 border-accent'
                              : 'bg-transparent border-border hover:border-muted-foreground/30'
                              }`}
                            onClick={() => toggleAgent(agent.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <Bot className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-bold">{agent.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">{agent.role || 'Agente'} • {agent.channels.join(', ')}</p>
                              </div>
                            </div>
                            <Checkbox
                              checked={formData.linked_agents?.includes(agent.id)}
                              onCheckedChange={() => toggleAgent(agent.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </div>
                </ScrollArea>

                <div className="p-6 border-t border-border flex justify-between items-center bg-muted/10">
                  <div className="text-[10px] text-muted-foreground">
                    {editingFlow ? `Editando: ${editingFlow.id}` : 'Novo Contrato'} • Enterprise Guard v1.0
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                    <Button className="bg-accent hover:bg-accent/90 px-8" size="sm" onClick={handleSave}>
                      Salvar Configurações
                    </Button>
                  </div>
                </div>
              </Tabs>
            </DialogContent>
          </Dialog>
        </Tabs>
      </TooltipProvider>
    </MainLayout>
  );
}
