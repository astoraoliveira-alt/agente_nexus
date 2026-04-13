import { Bot, MessageSquare, Phone, Settings, Plus, Search, ShieldCheck, ShieldAlert, BookOpen, AlertCircle, MoreVertical, Trash2, Pencil, Sparkles, Headphones, Workflow, Play, Copy, Globe, MessageCircle, HelpCircle, History, FileText, Info, X, Cloud, Key, Smartphone } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { api } from '@/services/api';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Agent, AILifecycleStage, AIPolicy, AgentTool } from '@/lib/types';
import { AgentKnowledgeTab } from '@/components/agents/AgentKnowledgeTab';
import { AgentEvolutionTab } from '@/components/agents/AgentEvolutionTab';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { agentsService } from '@/services/agents.service';

export default function Agents() {
  const { openSlideOver, currentTenant, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availablePolicies, setAvailablePolicies] = useState<AIPolicy[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // AgentTool CRUD state
  const [agentTools, setAgentTools] = useState<AgentTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [newTool, setNewTool] = useState<Partial<AgentTool>>({
    name: '',
    description: '',
    method: 'POST',
    url: '',
    headers: {},
    body_mapping: {},
    query_params: {},
    response_mode: 'json',
    category: 'query',
    is_active: true,
  });
  const [showNewToolForm, setShowNewToolForm] = useState(false);
  const [newToolHeadersRaw, setNewToolHeadersRaw] = useState('{}');
  const [newToolBodyRaw, setNewToolBodyRaw] = useState('{}');

  // Blueprint state
  const [blueprintRaw, setBlueprintRaw] = useState('');

  // Sub-agent dialog state
  const [isSubAgentDialogOpen, setIsSubAgentDialogOpen] = useState(false);
  const [parentAgentForSub, setParentAgentForSub] = useState<Agent | null>(null);
  const [subAgentFormData, setSubAgentFormData] = useState<Partial<Agent>>({});

  const handleOpenSubAgentDialog = (parentAgent: Agent) => {
    setParentAgentForSub(parentAgent);
    setSubAgentFormData({
      name: '',
      role: 'Agente de Segurança',
      riskLevel: 'low',
      lifecycleStage: 'development',
      channels: ['text'],
      status: 'active',
      type: parentAgent.type || 'conversational',
      parent_agent_id: parentAgent.id,
      is_gatekeeper: true,
      gatekeeper_scope: 'specific',
      requires_security: false,
      brainConfig: {
        modelId: 'gpt-4o',
        temperature: 0.3,
        systemPrompt: '',
      },
      integrationConfig: { response_mode: 'match_input' },
    });
    setIsSubAgentDialogOpen(true);
  };

  const handleSaveSubAgent = async () => {
    if (!currentTenant || !parentAgentForSub) return;
    if (!subAgentFormData.name?.trim()) {
      toast.error('Informe um nome para o sub-agente.');
      return;
    }
    try {
      const created = await api.createAgent({
        ...subAgentFormData,
        tenantId: currentTenant.id,
        last_actor_name: currentUser?.name || 'Sistema',
      });
      setAgents(prev => [created, ...prev]);
      toast.success(`Sub-agente "${created.name}" criado com sucesso!`);
      setIsSubAgentDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar sub-agente.');
    }
  };

  // Form State
  const [formData, setFormData] = useState<Partial<Agent>>({
    name: '',
    role: 'New Agent',
    riskLevel: 'low',
    lifecycleStage: 'development',
    channels: ['text'],
    status: 'active'
  });

  // Only top-level agents in the grid; sub-agents are shown nested under their parent
  const parentAgents = agents.filter(agent =>
    !agent.parent_agent_id &&
    agent.name.toLowerCase().includes(search.toLowerCase())
  );

  // Helper: get all sub-agents for a given parent
  const getSubAgents = (parentId: string) =>
    agents.filter(a => a.parent_agent_id === parentId);

  useEffect(() => {
    async function loadData() {
      if (currentTenant) {
        try {
          const [agentsData, policiesData] = await Promise.all([
            api.getAgents(currentTenant.id),
            api.getPolicies(currentTenant.id)
          ]);
          setAgents(agentsData);
          setAvailablePolicies(policiesData);
        } catch (error) {
          toast.error('Erro ao carregar dados');
        }
      }
    }
    loadData();
  }, [currentTenant]);

  // Load AgentTools when dialog opens for editing
  useEffect(() => {
    async function loadTools() {
      if (!isDialogOpen || !currentTenant) return;
      setLoadingTools(true);
      try {
        const tools = await agentsService.getAgentTools(
          currentTenant.id,
          editingAgent?.id
        );
        setAgentTools(tools);
      } catch (e) {
        console.error('Failed to load agent tools', e);
        setAgentTools([]);
      } finally {
        setLoadingTools(false);
      }
    }
    loadTools();
    // Reset new tool form
    setShowNewToolForm(false);
    setNewTool({ name: '', description: '', method: 'POST', url: '', headers: {}, body_mapping: {}, query_params: {}, response_mode: 'json', category: 'query', is_active: true });
    setNewToolHeadersRaw('{}');
    setNewToolBodyRaw('{}');
  }, [isDialogOpen, editingAgent?.id, currentTenant]);

  const handleCloneAgent = async (agent: Agent) => {
    if (!currentTenant) return;

    try {
      const { id, createdAt, updatedAt, ...agentData } = agent as any;
      const clonedAgent: Partial<Agent> = {
        ...agentData,
        name: `${agent.name} (CÓPIA)`,
        status: 'active', // Clone starts active or maybe strict copy? Let's keep strict copy but ensure clean state
      };

      const created = await api.createAgent(clonedAgent);
      setAgents(prev => [created, ...prev]);
      toast.success('Agente clonado com sucesso');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao clonar agente');
    }
  };

  const handleOpenDialog = (agent: Agent | null = null) => {
    if (agent) {
      setEditingAgent(agent);
      setFormData(agent);
      setBlueprintRaw(agent.workflow_blueprint ? JSON.stringify(agent.workflow_blueprint, null, 2) : '');
    } else {
      setEditingAgent(null);
      setFormData({
        name: '',
        role: 'Assistant',
        riskLevel: 'low',
        lifecycleStage: 'development',
        channels: ['text'],
        status: 'active',
        whatsapp_provider: 'evolution',
        activeConversations: 0,
        totalConversations: 0,
        sessionTimeoutSeconds: 3600,
        policies: [],
        brainConfig: {
          modelId: 'gpt-4o',
          temperature: 0.5,
          maxTokens: 2048,
          systemPrompt: '',
          userPromptTemplate: '',
          greetingMessage: ''
        },
        integrationConfig: {
          response_mode: 'match_input'
        },
        workflow_blueprint: undefined
      });
      setBlueprintRaw('');
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentTenant) return;

    // Validation for Mandatory Fields (Dumb Engine Pattern)
    if (!formData.brainConfig?.systemPrompt?.trim()) {
      toast.error('O Prompt de Sistema é obrigatório para definir a personalidade da IA.');
      return;
    }
    if (!formData.brainConfig?.userPromptTemplate?.trim()) {
      toast.error('O Template da Mensagem do Usuário é obrigatório para o padrão "Motor Burro".');
      return;
    }

    // Parse Blueprint JSON
    let parsedBlueprint = undefined;
    if (blueprintRaw.trim()) {
      try {
        parsedBlueprint = JSON.parse(blueprintRaw);
        // Basic validation
        if (!parsedBlueprint.initial_step || !parsedBlueprint.steps) {
          toast.error('Blueprint inválido: deve conter "initial_step" e "steps".');
          return;
        }
      } catch (e) {
        toast.error('Erro no Blueprint: JSON inválido.');
        return;
      }
    }

    try {
      const finalFormData = {
        ...formData,
        workflow_blueprint: parsedBlueprint
      };

      if (editingAgent) {
        // Update
        const updated = await api.updateAgent(editingAgent.id, {
          ...finalFormData,
          last_actor_name: currentUser?.name || 'Sistema'
        });
        setAgents(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
        toast.success('Agente atualizado com sucesso');
      } else {
        // Create
        const newAgentRef: Partial<Agent> = {
          ...finalFormData,
          tenantId: currentTenant.id,
          last_actor_name: currentUser?.name || 'Sistema'
        };
        const created = await api.createAgent(newAgentRef);
        setAgents(prev => [created, ...prev]);
        toast.success('Agente criado com sucesso');
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar agente');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click

    // Confirm deletion
    if (!window.confirm("Tem certeza que deseja excluir este agente?")) return;

    try {
      await api.deleteAgent(id);
      setAgents(prev => prev.filter(a => a.id !== id));
      toast.success('Agente removido');
    } catch (error) {
      console.error("Failed to delete agent:", error);
      toast.error('Erro ao remover agente');
    }
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Agentes</h1>
                <p className="text-sm text-muted-foreground">Gerencie seus agentes de IA conversacionais</p>
              </div>
              <Button className="bg-accent hover:bg-accent/90" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Agente
              </Button>
            </div>

            {/* Search */}
            <div className="mt-4 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar agentes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Agents Grid — parent cards with nested sub-agents */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {parentAgents.map((agent) => {
              const subAgents = getSubAgents(agent.id);
              return (
                <div key={agent.id} className="flex flex-col gap-0">
                  {/* ─── Parent Agent Card ─── */}
                  <div
                    className="kpi-card hover:shadow-lg transition-all relative cursor-default rounded-b-none border-b-0" style={{ borderBottomLeftRadius: subAgents.length > 0 ? 0 : undefined, borderBottomRightRadius: subAgents.length > 0 ? 0 : undefined }}
                  >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-accent/10 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <div className="flex items-center gap-2">
                        {agent.lifecycleStage === 'development' && (
                          <Badge variant="outline" className="h-4 text-[10px] py-0 border-blue-400/30 text-blue-500 bg-blue-500/5">
                            SANDBOX
                          </Badge>
                        )}
                        {agent.riskLevel === 'high' && (
                          <Badge variant="outline" className="h-4 text-[10px] py-0 border-red-400/30 text-red-500 bg-red-500/5">
                            FALLBACK REQ
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className={`status-dot ${agent.status === 'active' ? 'status-online' : 'status-offline'}`} />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDialog(agent); }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openSlideOver('agent-history', agent); }}>
                          <History className="h-4 w-4 mr-2" />
                          Ver Histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCloneAgent(agent); }}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        {!agent.parent_agent_id && (
                          <DropdownMenuItem 
                            className="text-accent focus:bg-accent focus:text-white focus:!text-white"
                            onClick={(e) => { e.stopPropagation(); handleOpenSubAgentDialog(agent); }}
                          >
                            <Bot className="h-4 w-4 mr-2" />
                            <span className="font-medium">Adicionar Sub-agente</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={(e) => handleDelete(agent.id, e)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Governance Risk Badge */}
                {/* Line 1: Identity & Channels */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {/* Agent Type */}
                  <Badge variant="outline" className={cn(
                    "text-[10px] h-5 gap-1 border-0 brightness-110 saturate-125",
                    agent.type === 'whatsapp' ? 'bg-[#25D366]/10 text-[#075E54] dark:text-[#25D366]' :
                      agent.type === 'embedded' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                  )}>
                    {agent.type === 'whatsapp' ? <MessageCircle className="h-3 w-3" /> :
                      agent.type === 'embedded' ? <Globe className="h-3 w-3" /> :
                        <MessageSquare className="h-3 w-3" />
                    }
                    {agent.type === 'whatsapp' ? 'WhatsApp API' :
                      agent.type === 'embedded' ? 'Embarcado' :
                        'Conversacional'}
                  </Badge>

                  {/* WhatsApp Provider Specialty Badge */}
                  {agent.type === 'whatsapp' && (
                    <Badge variant="outline" className="text-[9px] h-5 gap-1 border-border/50 bg-background/50 text-muted-foreground uppercase font-mono px-1.5 translate-y-[0.5px]">
                      {agent.whatsapp_provider === 'zenvia' ? (
                        <>
                          <Cloud className="h-2.5 w-2.5 text-blue-500" /> Zenvia
                        </>
                      ) : agent.whatsapp_provider === 'meta' ? (
                        <>
                          <Cloud className="h-2.5 w-2.5 text-blue-400" /> Meta
                        </>
                      ) : (
                        <>
                          <Smartphone className="h-2.5 w-2.5 text-[#25D366]" /> Evolution
                        </>
                      )}
                    </Badge>
                  )}

                  {/* Channels (Texto/Voz) - Moved here to be next to Type */}
                  {agent.channels.includes('text') && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-1 bg-muted/50 border-0">
                      <MessageSquare className="h-3 w-3" />
                      Texto
                    </Badge>
                  )}
                  {agent.channels.includes('voice') && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-1 bg-muted/50 border-0">
                      <Phone className="h-3 w-3" />
                      Voz
                    </Badge>
                  )}

                  {/* Lifecycle Badge */}
                  {agent.lifecycleStage && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-1 border-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${agent.lifecycleStage === 'production' ? 'bg-green-500' :
                        agent.lifecycleStage === 'development' ? 'bg-blue-500' :
                          agent.lifecycleStage === 'validation' ? 'bg-amber-500' : 'bg-gray-400'
                        }`} />
                      {agent.lifecycleStage.charAt(0).toUpperCase() + agent.lifecycleStage.slice(1)}
                    </Badge>
                  )}

                  {/* Risk Badge */}
                  {agent.riskLevel && (
                    <Badge variant="outline" className={`
                      text-[10px] h-5 gap-1 border-0
                      ${agent.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        agent.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}
                    `}>
                      <ShieldCheck className="h-3 w-3" />
                      Risco {agent.riskLevel === 'high' ? 'Alto' : agent.riskLevel === 'medium' ? 'Médio' : 'Baixo'}
                    </Badge>
                  )}

                  {/* Policies Badge */}
                  {agent.policies && agent.policies.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-1 border-0">
                      <BookOpen className="h-3 w-3" />
                      {agent.policies.length} Políticas
                    </Badge>
                  )}
                </div>

                {/* ISO 23894 Risk Details */}
                {agent.riskAssessment && (
                  <div className="mb-4 text-xs text-muted-foreground bg-muted/50 p-2 rounded border border-border">
                    <div className="flex justify-between mb-1">
                      <span>Score de Risco:</span>
                      <span className="font-mono font-medium">{agent.riskScore || agent.riskAssessment.riskScore}/100</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Próxima Revisão:</span>
                      <span>{agent.riskAssessment.nextReviewDate.toLocaleDateString()}</span>
                    </div>
                  </div>
                )}


                {/* Functional Stats (Load/Capacity/Cost) */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-muted rounded-md relative overflow-hidden">
                    {/* Capacity Bar */}
                    <div
                      className="absolute bottom-0 left-0 h-1 bg-primary transition-all"
                      style={{ width: `${Math.min(((agent.activeConversations || 0) / (agent.maxConcurrentConversations || 50)) * 100, 100)}%` }}
                    />
                    <p className="text-xl font-bold flex items-baseline gap-1">
                      {agent.activeConversations}
                      <span className="text-xs font-normal text-muted-foreground">/ {agent.maxConcurrentConversations || 50}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Capacidade em Uso</p>
                  </div>

                  <div className="p-3 bg-muted rounded-md flex flex-col justify-between">
                    <div>
                      <p className="text-lg font-bold leading-tight">
                        {agent.usage?.totalCost
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(agent.usage.totalCost)
                          : 'R$ 0,00'}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Custo Estimado</p>
                    </div>

                    <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-x-3 gap-y-1">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-mono font-bold text-muted-foreground leading-none">
                          {(agent.usage?.totalTokens || 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase">Tokens</span>
                      </div>

                      {/* Always show messages if they exist (> 0) or if it's predominantly a text agent */}
                      {((agent.usage?.totalMessages || 0) > 0 || !agent.channels.includes('voice')) && (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono font-bold text-muted-foreground leading-none">
                            {(agent.usage?.totalMessages || 0).toLocaleString()}
                          </span>
                          <span className="text-[9px] text-muted-foreground uppercase">Msgs</span>
                        </div>
                      )}

                      {/* Always show minutes if it's a voice agent or has voice usage */}
                      {(agent.channels.includes('voice') || Math.max(agent.usage?.totalStt || 0, agent.usage?.totalTts || 0) > 0) && (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono font-bold text-muted-foreground leading-none">
                            {Math.max((agent.usage?.totalStt || 0), (agent.usage?.totalTts || 0)).toFixed(1)}
                          </span>
                          <span className="text-[9px] text-muted-foreground uppercase">Min</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action */}
                <Button
                  variant="outline"
                  className="w-full hover:bg-accent hover:text-accent-foreground border-primary/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSlideOver('agent-config', agent);
                  }}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Detalhes
                </Button>
              </div>{/* end parent kpi-card */}

              {/* ─── Sub-Agent Cards (nested) ─── */}
              {subAgents.length > 0 && (
                <div className="border border-t-0 border-border rounded-b-lg overflow-hidden">
                  {/* Tree header */}
                  <div className="px-3 py-1.5 bg-muted/40 border-b border-border/50 flex items-center gap-1.5">
                    <div className="w-3 h-px bg-muted-foreground/30" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      {subAgents.length} Sub-agente{subAgents.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {subAgents.map((sub, idx) => {
                    const isGatekeeper = sub.is_gatekeeper;
                    const isLast = idx === subAgents.length - 1;

                    // ✅ Detecção APENAS por flags explícitas do banco — sem heurísticas de nome/role
                    const isSecurityAgent = sub.requires_security === true;

                    // Icon & color config per agent type
                    const iconConfig = isGatekeeper
                      ? { icon: <ShieldAlert className="h-3.5 w-3.5 text-red-500" />, bg: 'bg-red-500/10', dot: 'bg-red-500/70', badge: null }
                      : isSecurityAgent
                        ? { icon: <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />, bg: 'bg-amber-500/10', dot: 'bg-amber-500/70', badge: 'Segurança' }
                        : { icon: <Bot className="h-3.5 w-3.5 text-accent" />, bg: 'bg-accent/10', dot: 'bg-accent/60', badge: null };

                    return (
                      <div
                        key={sub.id}
                        className={`flex items-stretch group ${!isLast ? 'border-b border-border/40' : ''}`}
                      >
                        {/* Vertical connector line */}
                        <div className="flex flex-col items-center w-8 flex-shrink-0 py-3 pl-3">
                          <div className="w-px flex-1 bg-border/50" />
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 my-1 ${iconConfig.dot}`} />
                          {!isLast && <div className="w-px flex-1 bg-border/50" />}
                        </div>

                        {/* Sub-agent content */}
                        <div className="flex-1 py-2.5 pr-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Icon badge */}
                            <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${iconConfig.bg}`}>
                              {iconConfig.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold truncate leading-tight">{sub.name}</p>
                                {/* Security badge */}
                                {iconConfig.badge && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/25 flex-shrink-0">
                                    <ShieldAlert className="h-2 w-2" />
                                    {iconConfig.badge}
                                  </span>
                                )}
                                {isGatekeeper && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/15 text-red-600 border border-red-500/25 flex-shrink-0">
                                    <ShieldAlert className="h-2 w-2" />
                                    {sub.gatekeeper_scope === 'tenant' ? 'Global' : 'Gate'}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                {sub.role || (isGatekeeper ? 'Gatekeeper de Segurança' : isSecurityAgent ? 'Agente de Segurança' : 'Sub-agente')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div className={`status-dot ${
                              sub.status === 'active' ? 'status-online' : 'status-offline'
                            }`} />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDialog(sub); }}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Editar Sub-agente
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={(e) => handleDelete(sub.id, e)}>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
              );
            })}
          </div>
        </div>

        {/* Create/Edit Agent Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-2 border-b">
              <DialogTitle className="text-xl flex items-center gap-2">
                {editingAgent ? <Pencil className="h-5 w-5 text-accent" /> : <Plus className="h-5 w-5 text-accent" />}
                {editingAgent ? 'Configuração Profissional do Agente' : 'Criar Nova Inteligência'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="brain" className="w-full flex-1 flex flex-col min-h-0">
                {/* If editing a sub-agent, show a simplified banner */}
                {editingAgent?.parent_agent_id && (
                  <div className="mx-6 mt-4 flex items-center gap-2 bg-muted/40 border border-border/50 rounded-lg px-3 py-2">
                    <ShieldCheck className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      Editando <strong>sub-agente</strong> — configurações simplificadas.
                      Sub-agentes herdam canal e integração do agente pai.
                    </span>
                  </div>
                )}
                <TabsList className="flex w-full justify-start gap-4 px-6 border-b rounded-none h-auto min-h-12 flex-wrap sm:flex-nowrap sm:overflow-x-auto sm:overflow-y-hidden bg-background/95 backdrop-blur-md sticky top-0 z-40 scrollbar-hide py-2 shadow-sm">
                  <TabsTrigger value="brain" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 py-2 flex items-center gap-2 whitespace-nowrap">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    {editingAgent?.parent_agent_id ? 'Identidade & Prompt' : 'Cérebro & Identidade'}
                  </TabsTrigger>
                  {/* Tabs below hidden for sub-agents */}
                  {!editingAgent?.parent_agent_id && (
                    <TabsTrigger value="integration" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 py-2 flex items-center gap-2 whitespace-nowrap">
                      <Workflow className="h-4 w-4 shrink-0" />
                      Canais & Integração
                    </TabsTrigger>
                  )}
                  {!editingAgent?.parent_agent_id && (
                    <TabsTrigger value="governance" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 py-2 flex items-center gap-2 whitespace-nowrap">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      Governança & Risco
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="tools" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 py-2 flex items-center gap-2 whitespace-nowrap">
                    <Settings className="h-4 w-4 shrink-0" />
                    Ferramentas & APIs
                  </TabsTrigger>
                  {!editingAgent?.parent_agent_id && (
                    <TabsTrigger value="knowledge" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 py-2 flex items-center gap-2 whitespace-nowrap">
                      <BookOpen className="h-4 w-4 shrink-0" />
                      Base de Conhecimento
                    </TabsTrigger>
                  )}
                  {!editingAgent?.parent_agent_id && formData.type === 'whatsapp' && (
                    <TabsTrigger value="evolution" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 py-2 flex items-center gap-2 whitespace-nowrap">
                      <MessageCircle className="h-4 w-4 shrink-0" />
                      WhatsApp
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="brain" className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 shrink-0">
                    <div className="md:col-span-5 space-y-2">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Nome da Inteligência</Label>
                      <Input
                        className="text-lg font-semibold h-12 bg-muted/30 border-accent/20 focus:border-accent"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ex: Consultor Estratégico de Vendas"
                      />
                    </div>
                    <div className="md:col-span-4 space-y-2">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Função / Cargo</Label>
                      <Input
                        className="text-lg font-semibold h-12 bg-muted/30 border-accent/20 focus:border-accent"
                        value={formData.role || ''}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        placeholder="Ex: Consultor de Vendas"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-2">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Tipo de Agente</Label>
                      <Select
                        disabled={!!editingAgent?.parent_agent_id}
                        value={formData.type || 'conversational'}
                        onValueChange={(v: any) => setFormData({ ...formData, type: v })}
                      >
                        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conversational">Conversacional (Voz)</SelectItem>
                          <SelectItem value="embedded">Conversacional (Site)</SelectItem>
                          <SelectItem value="whatsapp">Conversacional (WhatsApp)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0 mt-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Modelo LLM (Cérebro)</Label>
                      <Select
                        value={formData.brainConfig?.modelId || 'gpt-4o'}
                        onValueChange={(v: any) => setFormData({ ...formData, brainConfig: { ...formData.brainConfig, modelId: v } })}
                      >
                        <SelectTrigger className="font-mono text-sm h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4 Omni (Padrão)</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini (Rápido)</SelectItem>
                          <SelectItem value="o1-preview">o1-preview (Gênio)</SelectItem>
                          <SelectItem value="o1-mini">o1-mini</SelectItem>
                          <SelectItem value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">
                          Temp: {formData.brainConfig?.temperature || 0.5}
                        </Label>
                        <span className="text-[9px] text-muted-foreground italic">1.0 (Criativo)</span>
                      </div>
                      <Input
                        type="range"
                        step="0.01"
                        min="0"
                        max="1"
                        className="h-11 accent-accent"
                        value={formData.brainConfig?.temperature || 0.5}
                        onChange={(e) => setFormData({
                          ...formData,
                          brainConfig: {
                            ...formData.brainConfig,
                            temperature: parseFloat(e.target.value)
                          }
                        })}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Memória: {formData.contextWindow || 10}</Label>
                        <span className="text-[9px] text-muted-foreground italic">50 (Longo)</span>
                      </div>
                      <Input
                        type="range"
                        step="1"
                        min="1"
                        max="50"
                        className="h-11 accent-accent cursor-pointer"
                        value={formData.contextWindow || 10}
                        onChange={(e) => setFormData({
                          ...formData,
                          contextWindow: parseInt(e.target.value)
                        })}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <Label className="text-[10px] font-bold secondary-text text-accent uppercase tracking-wider">Max Tokens</Label>
                        <span className="text-[9px] font-mono font-bold">{formData.brainConfig?.maxTokens || 2048}</span>
                      </div>
                      <Input
                        type="number"
                        className="h-9 font-mono text-xs bg-muted/30"
                        value={formData.brainConfig?.maxTokens || 2048}
                        onChange={(e) => setFormData({
                          ...formData,
                          brainConfig: {
                            ...formData.brainConfig,
                            maxTokens: parseInt(e.target.value)
                          }
                        })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Mensagem de Saudação (Início da Conversa)</Label>
                      <Badge variant="outline" className="text-[10px] font-mono border-muted text-muted-foreground uppercase">Opcional</Badge>
                    </div>
                    <Textarea
                      className="bg-muted/30 border-accent/20 focus:border-accent min-h-[80px]"
                      placeholder="Ex: Olá! Sou o assistente virtual da Davos Nexus. Como posso te ajudar hoje?"
                      value={formData.brainConfig?.greetingMessage || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        brainConfig: {
                          ...formData.brainConfig,
                          greetingMessage: e.target.value
                        }
                      })}
                    />
                    <p className="text-[10px] text-muted-foreground">Esta mensagem será enviada automaticamente pelo n8n quando uma saudação for detectada.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[300px]">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Prompt de Sistema (Personalidade & Regras)</Label>
                        <Badge variant="outline" className="text-[10px] font-mono border-muted text-muted-foreground">OBRIGATÓRIO</Badge>
                      </div>
                      <Textarea
                        className="flex-1 p-4 font-mono text-sm bg-[#0B1A28] text-blue-50 rounded-md border border-[#1A2E44] focus:ring-2 focus:ring-accent outline-none resize-none leading-relaxed h-[300px] shadow-inner"
                        placeholder="Instrua sua inteligência aqui... Ex: Você é uma assistente de vendas focada em conversão, utilize uma linguagem direta e cordial."
                        value={formData.brainConfig?.systemPrompt || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          brainConfig: {
                            ...formData.brainConfig,
                            systemPrompt: e.target.value
                          }
                        })}
                      />
                      <p className="text-[10px] text-muted-foreground">O motor usará este prompt como base para a personalidade da IA.</p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Template da Mensagem do Usuário</Label>
                        <Badge variant="outline" className="text-[10px] font-mono border-muted text-muted-foreground">OBRIGATÓRIO</Badge>
                      </div>
                      <Textarea
                        className="flex-1 p-4 font-mono text-sm bg-[#0B1A28] text-blue-50 rounded-md border border-[#1A2E44] focus:ring-2 focus:ring-accent outline-none resize-none leading-relaxed h-[300px] shadow-inner"
                        placeholder="Ex: Responda a seguinte dúvida usando o contexto acima: {message}"
                        value={formData.brainConfig?.userPromptTemplate || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          brainConfig: {
                            ...formData.brainConfig,
                            userPromptTemplate: e.target.value
                          }
                        })}
                      />
                      <p className="text-[10px] text-muted-foreground">Dica: Use {'{message}'} para que o sistema injete a fala do usuário dinamicamente.</p>
                    </div>
                  </div>

                   {/* Workflow State Machine (Blueprint) */}
                   {!editingAgent?.parent_agent_id && (
                    <div className="space-y-4 border-t border-border pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Workflow className="h-5 w-5 text-accent" />
                          <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Blueprint da Conversa (State Machine)</Label>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono border-muted text-muted-foreground">OPCIONAL / JSON</Badge>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-8 flex flex-col space-y-2">
                           <Textarea
                            className="flex-1 p-4 font-mono text-xs bg-[#090F14] text-green-400 rounded-md border border-[#1A2E44] focus:ring-2 focus:ring-accent outline-none resize-none leading-relaxed h-[350px] shadow-inner"
                            placeholder='{ "initial_step": "start", "steps": { "start": { "rules": "...", "allowed_next": ["confirmacao"] } } }'
                            value={blueprintRaw}
                            onChange={(e) => setBlueprintRaw(e.target.value)}
                          />
                        </div>
                        
                        <div className="lg:col-span-4 space-y-4">
                          <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                            <h5 className="text-xs font-bold text-accent uppercase flex items-center gap-2 mb-2">
                              <HelpCircle className="h-4 w-4" /> Como configurar o Fluxo?
                            </h5>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              O Blueprint define os <strong>estados determinísticos</strong> da conversa. Isso evita que a IA tome decisões aleatórias.
                            </p>
                            
                            <div className="mt-4 space-y-3">
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-foreground">initial_step:</span>
                                <p className="text-[10px] text-muted-foreground">Nome do estado onde toda nova conversa começa.</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-foreground">rules:</span>
                                <p className="text-[10px] text-muted-foreground">Instrução específica que a IA deve seguir neste estado atual.</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-foreground">allowed_next:</span>
                                <p className="text-[10px] text-muted-foreground">Lista de estados para onde a IA tem permissão de "pular".</p>
                              </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-accent/10">
                               <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full text-[10px] h-8 border-accent/30 text-accent hover:bg-accent/10"
                                onClick={() => setBlueprintRaw(JSON.stringify({
                                  initial_step: "start",
                                  steps: {
                                    start: { rules: "Apresente-se e veja se o cliente quer o link.", allowed_next: ["confirmacao"] },
                                    confirmacao: { rules: "Peça o CNPJ. Se ok, avance para link.", allowed_next: ["link"] },
                                    link: { rules: "Envie o link e finalize.", allowed_next: ["suporte"] },
                                    suporte: { rules: "Apenas tire dúvidas.", allowed_next: ["suporte"] }
                                  }
                                }, null, 2))}
                              >
                                Carregar Exemplo Padrão
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                   )}

                  {/* Security toggle — only shown when editing a sub-agent */}
                  {editingAgent?.parent_agent_id && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 flex items-start gap-4">
                      <div className="flex-shrink-0 mt-0.5">
                        <ShieldAlert className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">Sub-agente Autenticador (Gatekeeper)</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Este agente será orquestrado como a camada de segurança (validação de identidade) antes de responder ao cliente.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={formData.is_gatekeeper ?? false}
                            onClick={() => setFormData({ ...formData, is_gatekeeper: !(formData.is_gatekeeper ?? false) })}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 ${
                              formData.is_gatekeeper
                                ? 'bg-amber-500 border-amber-500'
                                : 'bg-muted border-border'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 mt-0.5 ${
                                formData.is_gatekeeper ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="integration" className="p-6 space-y-8 animate-in fade-in slide-in-from-right-2">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold uppercase flex items-center gap-2 text-accent">
                      <MessageSquare className="h-4 w-4" /> Canais de Comunicação
                    </h4>
                    <div className="flex gap-4">
                      <Button
                        type="button"
                        variant={formData.channels?.includes('text') ? 'default' : 'outline'}
                        className={cn("flex-1 h-16 gap-3 text-base justify-start px-6", formData.channels?.includes('text') && "bg-accent hover:bg-accent/90")}
                        onClick={() => {
                          const current = formData.channels || [];
                          const newer = current.includes('text') ? current.filter(c => c !== 'text') : [...current, 'text'];
                          setFormData({ ...formData, channels: newer as any });
                        }}
                      >
                        <MessageSquare className="h-6 w-6" />
                        <div className="text-left">
                          <p className="font-bold">WhatsApp / Texto</p>
                          <p className="text-[10px] opacity-70">Conversas em texto e dados</p>
                        </div>
                      </Button>
                      <Button
                        type="button"
                        variant={formData.channels?.includes('voice') ? 'default' : 'outline'}
                        className={cn("flex-1 h-16 gap-3 text-base justify-start px-6", formData.channels?.includes('voice') && "bg-accent hover:bg-accent/90")}
                        onClick={() => {
                          const current = formData.channels || [];
                          const newer = current.includes('voice') ? current.filter(c => c !== 'voice') : [...current, 'voice'];
                          setFormData({ ...formData, channels: newer as any });
                        }}
                      >
                        <Phone className="h-6 w-6" />
                        <div className="text-left">
                          <p className="font-bold">Voz / Telefone</p>
                          <p className="text-[10px] opacity-70">Ligação em tempo real</p>
                        </div>
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Voice Config */}
                    <div className="space-y-4 border border-border/50 p-5 rounded-lg bg-card shadow-sm">
                      <h4 className="text-sm font-semibold uppercase flex items-center gap-2 text-muted-foreground border-b border-border pb-3">
                        <Workflow className="h-4 w-4" /> Orquestração (Integração de Workflows)
                      </h4>
                      <div className="space-y-4 pt-2">

                        <div className="space-y-2 animate-in slide-in-from-top-1">
                          <Label className="text-xs">Formato de Resposta (Mídia)</Label>
                          <Select
                            value={formData.integrationConfig?.response_mode || 'match_input'}
                            onValueChange={(v: any) => setFormData({
                              ...formData,
                              integrationConfig: { ...formData.integrationConfig, response_mode: v }
                            })}
                          >
                            <SelectTrigger className="h-9 text-xs bg-muted/30 border-border"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="match_input">Dinâmico (Mimetiza o Usuário: Áudio ⇆ Áudio)</SelectItem>
                              <SelectItem value="text_only">Apenas Texto (Força mensagem escrita)</SelectItem>
                              <SelectItem value="audio_only">Apenas Áudio (Força mensagem de voz)</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[9px] text-muted-foreground italic leading-tight">
                            Comportamento do agente na devolução de mensagens pelo WhatsApp ou WebChat.
                          </p>
                        </div>

                        <div className="space-y-2 animate-in slide-in-from-top-1">
                          <Label className="text-xs">Tempo de Expiração da Sessão (minutos)</Label>
                          <Input
                            type="number"
                            min="1"
                            max="1440"
                            className="h-9 font-mono text-xs bg-muted/30 text-foreground border-border"
                            value={formData.sessionTimeoutSeconds ? Math.floor(formData.sessionTimeoutSeconds / 60) : 60}
                            onChange={(e) => {
                              const minutes = parseInt(e.target.value);
                              if (!isNaN(minutes)) {
                                setFormData({
                                  ...formData,
                                  sessionTimeoutSeconds: minutes * 60
                                });
                              }
                            }}
                          />
                          <p className="text-[9px] text-muted-foreground italic leading-tight">
                            Tempo de inatividade limite antes que a conversação seja encerrada pelo sistema. Padrão: 60 minutos.
                          </p>
                        </div>

                        {formData.type === 'whatsapp' && (
                          <>
                            <div className="space-y-2 animate-in slide-in-from-top-1">
                              <Label className="text-xs font-bold text-accent">Provedor WhatsApp</Label>
                              <Select
                                value={formData.whatsapp_provider || 'evolution'}
                                onValueChange={(v: any) => setFormData({ ...formData, whatsapp_provider: v })}
                              >
                                <SelectTrigger className="h-9 text-xs bg-muted/30 border-accent/20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="zenvia">
                                    <div className="flex items-center gap-2">
                                      <Cloud className="h-3 w-3 text-blue-500" /> Meta Cloud API — Zenvia (Oficial)
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="meta">
                                    <div className="flex items-center gap-2">
                                      <Cloud className="h-3 w-3" /> Meta Cloud API (Direto)
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="evolution">
                                    <div className="flex items-center gap-2">
                                      <Smartphone className="h-3 w-3" /> Evolution API
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {formData.whatsapp_provider === 'zenvia' ? (
                              <div className="grid grid-cols-1 gap-4 pt-2 border-t border-border/30 mt-2 animate-in slide-in-from-top-2">
                                <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
                                  <Cloud className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                                  <p className="text-[10px] text-blue-600 dark:text-blue-400 leading-snug">
                                    <strong>Zenvia BSP</strong> — Provedor oficial Meta. O Porteiro receberá mensagens em
                                    <code className="font-mono bg-blue-500/10 px-0.5 rounded mx-0.5">/v1/zenvia/webhook</code>
                                    automaticamente.
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">
                                    Channel ID Zenvia (Número "from")
                                  </Label>
                                  <Input
                                    className="h-9 font-mono text-xs bg-muted/30 border-accent/20 focus:border-accent"
                                    placeholder="Ex: 5511888880000"
                                    value={formData.zenvia_channel_id || ''}
                                    onChange={(e) => setFormData({ ...formData, zenvia_channel_id: e.target.value })}
                                  />
                                  <p className="text-[9px] text-muted-foreground">Número WhatsApp Business registrado na Zenvia (com DDI, sem +)</p>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">
                                    API Token Zenvia
                                  </Label>
                                  <div className="relative">
                                    <Input
                                      type="password"
                                      className="h-9 font-mono text-xs bg-muted/30 pr-10"
                                      placeholder="hKp94crjv9OF3UGrCpSXUJw1-UYHhRvLKNLt"
                                      value={formData.zenvia_api_token || ''}
                                      onChange={(e) => setFormData({ ...formData, zenvia_api_token: e.target.value })}
                                    />
                                    <Key className="h-3.5 w-3.5 absolute right-3 top-2.5 text-muted-foreground opacity-50" />
                                  </div>
                                  <p className="text-[9px] text-muted-foreground">Gerado em app.zenvia.com/home/api — X-API-TOKEN do header</p>
                                </div>
                              </div>
                            ) : formData.whatsapp_provider === 'meta' ? (
                              <div className="grid grid-cols-1 gap-4 pt-2 border-t border-border/30 mt-2 animate-in slide-in-from-top-2">
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">Phone Number ID</Label>
                                  <Input 
                                    className="h-9 font-mono text-xs bg-muted/30" 
                                    placeholder="Ex: 1056723490123"
                                    value={formData.meta_phone_id || ''}
                                    onChange={(e) => setFormData({ ...formData, meta_phone_id: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">WABA ID (WhatsApp Business Account)</Label>
                                  <Input 
                                    className="h-9 font-mono text-xs bg-muted/30" 
                                    placeholder="Ex: 209876543210"
                                    value={formData.meta_waba_id || ''}
                                    onChange={(e) => setFormData({ ...formData, meta_waba_id: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">API Access Token (Permanente)</Label>
                                  <div className="relative">
                                    <Input 
                                      type="password"
                                      className="h-9 font-mono text-xs bg-muted/30 pr-10" 
                                      placeholder="EAABw..."
                                      value={formData.meta_api_token || ''}
                                      onChange={(e) => setFormData({ ...formData, meta_api_token: e.target.value })}
                                    />
                                    <Key className="h-3.5 w-3.5 absolute right-3 top-2.5 text-muted-foreground opacity-50" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">Verify Token (Webhook)</Label>
                                  <Input 
                                    className="h-9 font-mono text-xs bg-muted/30" 
                                    placeholder="Ex: davos_nexus_secret"
                                    value={formData.meta_verify_token || ''}
                                    onChange={(e) => setFormData({ ...formData, meta_verify_token: e.target.value })}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-4 pt-2 border-t border-border/30 mt-2 animate-in slide-in-from-top-2">
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">Nome da Instância Evolution</Label>
                                  <Input
                                    className="h-9 font-mono text-xs bg-muted/30 border-accent/20 focus:border-accent"
                                    value={formData.evolution_instance || ''}
                                    onChange={(e) => setFormData({ ...formData, evolution_instance: e.target.value })}
                                    placeholder="Ex: d Davos-Nexus-Zap"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold secondary-text text-muted-foreground uppercase tracking-wider">API Token (Opcional)</Label>
                                  <Input
                                    type="password"
                                    className="h-9 font-mono text-xs bg-muted/30"
                                    value={formData.evolution_token || ''}
                                    onChange={(e) => setFormData({ ...formData, evolution_token: e.target.value })}
                                    placeholder="Token da instância"
                                  />
                                </div>
                              </div>
                            )}
                            <p className="text-[9px] text-muted-foreground italic leading-tight mt-2">
                              Necessário para que o sistema identifique este agente automaticamente no fluxo de WhatsApp.
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 border border-border/50 p-5 rounded-lg bg-card shadow-sm">
                      <h4 className="text-sm font-semibold uppercase flex items-center gap-2 text-muted-foreground border-b border-border pb-3">
                        <Headphones className="h-4 w-4" /> Configuração de Voz
                      </h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Provedor</Label>
                          <Select
                            value={formData.voiceConfig?.provider || 'none'}
                            onValueChange={(v: any) => setFormData({ ...formData, voiceConfig: { ...formData.voiceConfig, provider: v } })}
                          >
                            <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Desativado</SelectItem>
                              <SelectItem value="vapi">VAPI (Principal)</SelectItem>
                              <SelectItem value="retell">Motor de Voz Alternativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {formData.voiceConfig?.provider === 'vapi' && (
                          <div className="space-y-2 animate-in slide-in-from-top-1">
                            <Label className="text-xs">Vapi Agent ID</Label>
                            <Input
                              className="h-8 text-xs font-mono"
                              value={formData.voiceConfig?.vapiAgentId || ''}
                              onChange={(e) => setFormData({ ...formData, voiceConfig: { ...formData.voiceConfig, vapiAgentId: e.target.value } })}
                              placeholder="Ex: d7b8a..."
                            />
                          </div>
                        )}
                        {formData.voiceConfig?.provider === 'retell' && (
                          <div className="space-y-2 animate-in slide-in-from-top-1">
                            <Label className="text-xs">ID do Agente de Voz</Label>
                            <Input
                              className="h-8 text-xs font-mono"
                              value={formData.voiceConfig?.retellAgentId || ''}
                              onChange={(e) => setFormData({ ...formData, voiceConfig: { ...formData.voiceConfig, retellAgentId: e.target.value } as any })}
                              placeholder="Ex: agent_..."
                            />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label className="text-xs">Ambient Sound</Label>
                          <Select
                            value={formData.voiceConfig?.ambientSound || 'clean'}
                            onValueChange={(v: any) => setFormData({ ...formData, voiceConfig: { ...formData.voiceConfig, ambientSound: v } })}
                          >
                            <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="clean">Estúdio</SelectItem>
                              <SelectItem value="office">Escritório</SelectItem>
                              <SelectItem value="coffee-shop">Café</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="governance" className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-4 p-5 border border-border/50 rounded-lg bg-card shadow-sm">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider border-b border-border pb-3">Status e Ciclo de Vida</h4>
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs">ISO 42001 Stage</Label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[200px] text-[11px]">
                                    Indica a maturidade e permissões de deploy do agente conforme norma ISO 42001.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Select
                              value={formData.lifecycleStage || 'development'}
                              onValueChange={(v: AILifecycleStage) => setFormData({ ...formData, lifecycleStage: v })}
                            >
                              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="poc_demo">PoC (Demonstração)</SelectItem>
                                <SelectItem value="development">Development (Sandbox)</SelectItem>
                                <SelectItem value="validation">Validation (Homologação)</SelectItem>
                                <SelectItem value="production">Production (Vivo)</SelectItem>
                                <SelectItem value="monitoring">Monitoring (Assistido)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs">Status Operacional</Label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[200px] text-[11px]">
                                    Define se o agente está processando requisições em tempo real.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Select
                              value={formData.status || 'inactive'}
                              onValueChange={(v: any) => setFormData({ ...formData, status: v })}
                            >
                              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">🟢 Ativo (Online)</SelectItem>
                                <SelectItem value="inactive">🔴 Inativo (Offline)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 p-5 border border-border/50 rounded-lg bg-card shadow-sm">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider border-b border-border pb-3">Segurança e Autonomia</h4>
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs">Nível de Autonomia (L1-L5)</Label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[200px] text-[11px]">
                                    Determina quanto controle a IA tem antes de exigir intervenção humana.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Select
                              value={String(formData.autonomyLevel || 1)}
                              onValueChange={(v: string) => setFormData({ ...formData, autonomyLevel: parseInt(v) as any })}
                            >
                              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">L1 - Assistido</SelectItem>
                                <SelectItem value="2">L2 - Limitado</SelectItem>
                                <SelectItem value="3">L3 - Condicional</SelectItem>
                                <SelectItem value="4">L4 - Alta Autonomia</SelectItem>
                                <SelectItem value="5">L5 - Totalmente Autônomo</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs">Limite de Concorrência</Label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[200px] text-[11px]">
                                    Volume máximo de conversas simultâneas permitidas para este agente.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Input
                              type="number"
                              className="h-9"
                              value={formData.maxConcurrentConversations || 50}
                              onChange={(e) => setFormData({ ...formData, maxConcurrentConversations: parseInt(e.target.value) })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 p-5 border border-border/50 rounded-lg bg-card shadow-sm">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider border-b border-border pb-3 flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" /> Gateway de Segurança (Gatekeeper)
                        </h4>
                        <div className="space-y-2 pt-2 flex flex-col">
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="identity-gate-switch"
                              checked={!!formData.requires_security}
                              onCheckedChange={(checked) => {
                                setFormData(prev => ({
                                  ...prev,
                                  requires_security: checked
                                }))
                              }}
                            />
                            <Label htmlFor="identity-gate-switch" className="text-sm font-semibold cursor-pointer">
                              Exigir Autenticação / Validação (Sessão Transacional)
                            </Label>
                          </div>
                          <p className="text-[11px] text-muted-foreground pt-1">
                            Com isso ativo, o workflow vai orquestrar a sessão com um Sub-Agente Gatekeeper antes de liberar respostas deste agente principal. O Sub-Agente (configurado separadamente com a flag "Gatekeeper") possuirá as regras e ferramentas de validação (ex: Consulta de CPF/CNPJ).
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-4 p-5 border border-border/50 rounded-lg bg-card shadow-sm">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider border-b border-border pb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Políticas Aplicadas
                        </h4>
                        <div className="grid grid-cols-1 gap-2 pt-2">
                          {availablePolicies.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic">Nenhuma política cadastrada em Governança.</p>
                          ) : (
                            availablePolicies.map((policy) => (
                              <div key={policy.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                                <Checkbox
                                  id={`policy-${policy.id}`}
                                  checked={formData.policies?.includes(policy.name)}
                                  onCheckedChange={(checked) => {
                                    const current = formData.policies || [];
                                    const next = checked
                                      ? [...current, policy.name]
                                      : current.filter(p => p !== policy.name);
                                    setFormData({ ...formData, policies: next });
                                  }}
                                />
                                <Label
                                  htmlFor={`policy-${policy.id}`}
                                  className="text-xs font-medium cursor-pointer flex-1"
                                >
                                  {policy.name}
                                  <span className="ml-2 text-[10px] text-muted-foreground font-normal">v{policy.version}</span>
                                </Label>
                              </div>
                            ))
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-2 border-t border-border/50 pt-2 italic">
                          As regras destas políticas (Pode/Não Pode) serão injetadas automaticamente no prompt do agente.
                        </p>
                      </div>

                      <div className="space-y-4 p-5 border border-border/50 rounded-lg bg-card shadow-sm">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider border-b border-border pb-3">Matriz de Risco</h4>
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs">Risco Inerente</Label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[200px] text-[11px]">
                                    Classificação de impacto baseada na sensibilidade dos dados e processos tratados.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Select
                              value={formData.riskLevel || 'low'}
                              onValueChange={(v: any) => {
                                const newFormData = { ...formData, riskLevel: v } as any;
                                if (v === 'high' && newFormData.capabilities?.identity_gate) {
                                  newFormData.capabilities.identity_gate.enabled = true;
                                }
                                setFormData(newFormData);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Baixo (Informativo)</SelectItem>
                                <SelectItem value="medium">Médio (Transacional)</SelectItem>
                                <SelectItem value="high">Alto (Crítico)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs">Score ISO (0-100)</Label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[200px] text-[11px]">
                                    Pontuação técnica de conformidade baseada nos requisitos da ISO 42001.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Input
                              type="number"
                              className="h-9"
                              value={formData.riskScore || 0}
                              onChange={(e) => setFormData({ ...formData, riskScore: parseInt(e.target.value) })}
                              min={0} max={100}
                            />
                          </div>
                          {formData.riskLevel === 'high' && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-500 italic">
                              Agentes de alto risco requerem monitoramento contínuo e log de auditoria simplificado (ISO 42001).
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="tools" className="p-6 space-y-6">
                  <div className="space-y-4 p-5 border border-border/50 rounded-lg bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <h4 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
                        <Settings className="h-4 w-4" /> Ferramentas (Agent Tools)
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-accent/30 text-accent hover:bg-accent hover:text-white transition-colors"
                        onClick={() => {
                          if (showNewToolForm) {
                            setShowNewToolForm(false);
                            setNewTool({ name: '', description: '', method: 'POST', url: '', headers: {}, body_mapping: {}, query_params: {}, response_mode: 'json', category: 'query', is_active: true });
                            setNewToolHeadersRaw('{}');
                            setNewToolBodyRaw('{}');
                          } else {
                            setShowNewToolForm(true);
                          }
                        }}
                      >
                        {showNewToolForm ? <X className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                        {showNewToolForm ? 'Cancelar' : 'Nova Ferramenta'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ferramentas são endpoints HTTP que o agente pode chamar durante a conversa. O n8n executará cada chamada via HTTP Request universal.
                      Use a <strong>categoria</strong> para indicar se é uma consulta comum (<code>query</code>), uma ação (<code>action</code>) ou uma chave de acesso de segurança (<code>access_key</code>).
                    </p>

                    {/* Add new tool form */}
                    {/* Add new tool form */}
                    {showNewToolForm && (
                      <div className="border border-border/60 rounded-xl p-6 space-y-5 bg-muted/20 animate-in slide-in-from-top-2 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 border-b border-border/50 pb-3">
                          <Plus className="h-4 w-4 text-accent" />
                          <h5 className="text-sm font-bold text-accent uppercase tracking-wider">Nova Ferramenta</h5>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                          <div className="md:col-span-7 space-y-2">
                            <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">Nome (identificador único)</Label>
                            <Input
                              placeholder="ex: consultar_saldo"
                              className="h-11 font-mono text-sm bg-background border-border/50 focus:border-accent"
                              value={newTool.name || ''}
                              onChange={e => setNewTool(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                            />
                          </div>
                          <div className="md:col-span-5 space-y-2">
                            <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">Categoria</Label>
                            <Select
                              value={newTool.category || 'query'}
                              onValueChange={v => setNewTool(p => ({ ...p, category: v as any }))}
                            >
                              <SelectTrigger className="h-11 text-sm bg-background border-border/50 focus:border-accent">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="query">🔍 query — Consulta de dados</SelectItem>
                                <SelectItem value="action">⚡ action — Execução de ação</SelectItem>
                                <SelectItem value="access_key">🔐 access_key — Validação de acesso</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">Descrição (instrução para a IA)</Label>
                          <Input
                            placeholder="Retorna as faturas em aberto do cliente identificado"
                            className="h-11 text-sm bg-background border-border/50 focus:border-accent"
                            value={newTool.description || ''}
                            onChange={e => setNewTool(p => ({ ...p, description: e.target.value }))}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                          <div className="md:col-span-3 space-y-2">
                            <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">Método HTTP</Label>
                            <Select
                              value={newTool.method || 'POST'}
                              onValueChange={v => setNewTool(p => ({ ...p, method: v as any }))}
                            >
                              <SelectTrigger className="h-11 text-sm bg-background border-border/50 focus:border-accent">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="PATCH">PATCH</SelectItem>
                                <SelectItem value="DELETE">DELETE</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-9 space-y-2">
                            <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">URL do Endpoint / Webhook</Label>
                            <Input
                              placeholder="https://servidor.com/api/ferramenta"
                              className="h-11 font-mono text-sm bg-background border-border/50 focus:border-accent"
                              value={newTool.url || ''}
                              onChange={e => setNewTool(p => ({ ...p, url: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">Headers (JSON)</Label>
                            <Textarea
                              rows={4}
                              placeholder='{"Authorization": "Bearer ${token}"}'
                              className="font-mono text-sm p-3 bg-background border-border/50 focus:border-accent resize-y min-h-[100px]"
                              value={newToolHeadersRaw}
                              onChange={e => setNewToolHeadersRaw(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">Body Mapping (JSON)</Label>
                            <Textarea
                              rows={4}
                              placeholder='{"cpf": "{{contact.cpf}}", "session": "{{session.id}}"}'
                              className="font-mono text-sm p-3 bg-background border-border/50 focus:border-accent resize-y min-h-[100px]"
                              value={newToolBodyRaw}
                              onChange={e => setNewToolBodyRaw(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-5 items-end justify-between pt-2">
                          <div className="space-y-2 w-full sm:w-64">
                            <Label className="text-xs font-bold secondary-text text-muted-foreground uppercase tracking-wider">Modo de Resposta</Label>
                            <Select
                              value={newTool.response_mode || 'json'}
                              onValueChange={v => setNewTool(p => ({ ...p, response_mode: v as any }))}
                            >
                              <SelectTrigger className="h-11 text-sm bg-background border-border/50 focus:border-accent">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="json">JSON</SelectItem>
                                <SelectItem value="text">Texto</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            className="h-11 px-8 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold tracking-wide shadow-sm"
                            onClick={async () => {
                                if (!newTool.name?.trim() || !newTool.url?.trim()) {
                                  toast.error('Nome e URL são obrigatórios.');
                                  return;
                                }
                                let parsedHeaders: Record<string, string> = {};
                                let parsedBody: Record<string, any> = {};
                                try { parsedHeaders = JSON.parse(newToolHeadersRaw || '{}'); } catch { toast.error('Headers inválido. Use JSON válido.'); return; }
                                try { parsedBody = JSON.parse(newToolBodyRaw || '{}'); } catch { toast.error('Body Mapping inválido. Use JSON válido.'); return; }
                                try {
                                  if (newTool.id) {
                                    const toolToUpdate = { ...newTool, headers: parsedHeaders, body_mapping: parsedBody };
                                    const updated = await agentsService.updateAgentTool(toolToUpdate.id, toolToUpdate);
                                    setAgentTools(prev => prev.map(t => t.id === updated.id ? updated : t));
                                    toast.success('Ferramenta atualizada com sucesso!');
                                  } else {
                                    const toolToCreate: Partial<AgentTool> = {
                                      ...newTool,
                                      tenant_id: currentTenant!.id,
                                      agent_id: editingAgent?.id,
                                      headers: parsedHeaders,
                                      body_mapping: parsedBody,
                                      parameters_schema: {},
                                    };
                                    const created = await agentsService.createAgentTool(toolToCreate);
                                    setAgentTools(prev => [...prev, created]);
                                    toast.success('Ferramenta criada com sucesso!');
                                  }
                                  setShowNewToolForm(false);
                                  setNewTool({ name: '', description: '', method: 'POST', url: '', headers: {}, body_mapping: {}, query_params: {}, response_mode: 'json', category: 'query', is_active: true });
                                  setNewToolHeadersRaw('{}');
                                  setNewToolBodyRaw('{}');
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Erro ao salvar ferramenta.');
                                }
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> {newTool.id ? 'Salvar Configuração' : 'Criar Ferramenta'}
                            </Button>
                        </div>
                      </div>
                    )}

                    {/* Existing tools list */}
                    {loadingTools ? (
                      <p className="text-sm text-muted-foreground italic text-center py-8">Carregando ferramentas...</p>
                    ) : agentTools.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground bg-muted/20 border border-border/50 rounded-xl">
                        <Settings className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-semibold">Nenhuma ferramenta configurada.</p>
                        <p className="text-xs mt-1">Clique em "Nova Ferramenta" para adicionar um endpoint que este agente pode chamar.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {agentTools.map((tool) => (
                          <div key={tool.id} className="border border-border/60 rounded-xl p-4 bg-background flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:border-accent/30 transition-colors">
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <code className="text-sm font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md">{tool.name}</code>
                                <Badge
                                  variant="outline"
                                  className={`px-2 py-0 text-[10px] font-semibold tracking-wide uppercase ${
                                    tool.category === 'access_key'
                                      ? 'border-red-400/40 text-red-500 bg-red-500/10'
                                      : tool.category === 'action'
                                      ? 'border-amber-400/40 text-amber-500 bg-amber-500/10'
                                      : 'border-blue-400/40 text-blue-500 bg-blue-500/10'
                                  }`}
                                >
                                  {tool.category === 'access_key' ? '🔐 access_key' : tool.category === 'action' ? '⚡ action' : '🔍 query'}
                                </Badge>
                                <Badge variant="outline" className="px-2 py-0 text-[10px] font-mono font-bold bg-muted/50">{tool.method}</Badge>
                                {!tool.is_active && <Badge variant="outline" className="px-2 py-0 text-[10px] text-muted-foreground">Inativo</Badge>}
                              </div>
                              {tool.description && <p className="text-xs text-muted-foreground">{tool.description}</p>}
                              <p className="text-[11px] font-mono text-muted-foreground/80 break-all bg-muted/30 px-2 py-1 rounded inline-block mt-1">{tool.url}</p>
                            </div>
                            <div className="flex gap-1 self-end sm:self-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-accent/10 hover:text-accent"
                                onClick={() => {
                                  setNewTool(tool);
                                  setNewToolHeadersRaw(JSON.stringify(tool.headers || {}, null, 2));
                                  setNewToolBodyRaw(JSON.stringify(tool.body_mapping || {}, null, 2));
                                  setShowNewToolForm(true);
                                  
                                  // Scroll to form smoothly
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                title="Editar ferramenta"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={async () => {
                                  if (!window.confirm(`Excluir a ferramenta "${tool.name}"?`)) return;
                                  try {
                                    await agentsService.deleteAgentTool(tool.id);
                                    setAgentTools(prev => prev.filter(t => t.id !== tool.id));
                                    toast.success('Ferramenta removida.');
                                  } catch (err) {
                                    toast.error('Erro ao remover ferramenta.');
                                  }
                                }}
                                title="Excluir ferramenta"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="knowledge" className="p-6">
                  {editingAgent ? (
                    <AgentKnowledgeTab
                      agentId={editingAgent.id}
                      tenantId={currentTenant?.id}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 space-y-4 opacity-50">
                      <AlertCircle className="h-12 w-12 text-muted-foreground" />
                      <div className="text-center">
                        <h4 className="font-bold uppercase tracking-wider">Agente não Identificado</h4>
                        <p className="text-xs text-muted-foreground mt-1">Salve o agente básico primeiro para poder injetar conhecimento especializado.</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="evolution" className="p-6 h-full">
                  <AgentEvolutionTab
                    agentId={editingAgent?.id || 'new'}
                    tenantSlug={currentTenant?.slug || 'demo'}
                    evolutionInstance={formData.evolution_instance}
                    evolutionToken={formData.evolution_token}
                    webhookUrl={formData.integrationConfig?.n8n_webhook_url}
                    onWebhookUrlChange={(url) => setFormData(prev => ({
                      ...prev,
                      integrationConfig: { ...prev.integrationConfig, n8n_webhook_url: url }
                    }))}
                    onInstanceLinked={(instanceName, token) => {
                      if (formData.evolution_instance !== instanceName) {
                        setFormData(prev => ({
                          ...prev,
                          evolution_instance: instanceName,
                          evolution_token: token
                        }));
                        toast.success('Vínculo preparado. Salve o agente para confirmar.');
                      }
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between gap-3 bg-muted/20">
              <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-md flex items-center gap-2 max-w-lg">
                <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-[11px] font-semibold text-amber-500 leading-tight">Persistência em Tempo Real</h4>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    As configurações de <strong>Prompt, Risco e Autonomia</strong> impactam o comportamento do agente de comunicação imediatamente.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button className="bg-accent hover:bg-accent/90" onClick={handleSave}>
                  {editingAgent ? 'Salvar Alterações' : 'Criar Agente'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== Sub-agent Creation Dialog ===== */}
        <Dialog open={isSubAgentDialogOpen} onOpenChange={setIsSubAgentDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-accent" />
                Novo Sub-agente
                {parentAgentForSub && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    → vinculado a <strong>{parentAgentForSub.name}</strong>
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Nome do Sub-agente</Label>
                <Input
                  placeholder="ex: Segurança CPF + NF"
                  className="h-9"
                  value={subAgentFormData.name || ''}
                  onChange={e => setSubAgentFormData(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Papel / Role</Label>
                <Input
                  placeholder="ex: Agente de Segurança"
                  className="h-9"
                  value={subAgentFormData.role || ''}
                  onChange={e => setSubAgentFormData(p => ({ ...p, role: e.target.value }))}
                />
              </div>

              {/* Gatekeeper flag */}
              <div className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold">🔐 É um Agente de Segurança (Gatekeeper)?</Label>
                    <p className="text-[10px] text-muted-foreground">Se ativo, este sub-agente será responsável por validar o acesso do usuário antes de liberar o agente pai.</p>
                  </div>
                  <Switch
                    checked={!!subAgentFormData.is_gatekeeper}
                    onCheckedChange={v => setSubAgentFormData(p => ({ ...p, is_gatekeeper: v }))}
                  />
                </div>

                {subAgentFormData.is_gatekeeper && (
                  <div className="space-y-1 animate-in slide-in-from-top-1">
                    <Label className="text-[11px]">Escopo de Atuação</Label>
                    <Select
                      value={subAgentFormData.gatekeeper_scope || 'specific'}
                      onValueChange={v => setSubAgentFormData(p => ({ ...p, gatekeeper_scope: v as any }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="specific">
                          <div>
                            <div className="font-medium">Específico (deste agente pai)</div>
                            <div className="text-[10px] text-muted-foreground">Só protege o agente "{parentAgentForSub?.name}"</div>
                          </div>
                        </SelectItem>
                        <SelectItem value="tenant">
                          <div>
                            <div className="font-medium">Global (todos do tenant)</div>
                            <div className="text-[10px] text-muted-foreground">Pode ser reutilizado por qualquer agente do tenant</div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Prompt do Sub-agente</Label>
                <Textarea
                  rows={4}
                  placeholder="Descreva a missão deste sub-agente. Ex: Você é um agente de segurança. Sua missão é validar o acesso do usuário através do CPF e da Nota Fiscal..."
                  className="text-xs bg-muted/30 resize-none"
                  value={subAgentFormData.brainConfig?.systemPrompt || ''}
                  onChange={e => setSubAgentFormData(p => ({
                    ...p,
                    brainConfig: { ...p.brainConfig, systemPrompt: e.target.value }
                  }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setIsSubAgentDialogOpen(false)}>Cancelar</Button>
              <Button className="bg-accent hover:bg-accent/90" onClick={handleSaveSubAgent}>
                <Bot className="h-4 w-4 mr-1" /> Criar Sub-agente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout >
  );
}
