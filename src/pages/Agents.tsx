import { Bot, MessageSquare, Phone, Settings, Plus, Search, ShieldAlert, BookOpen, AlertCircle, MoreVertical, Trash2, Pencil, Sparkles, Headphones, Workflow, Play, Copy, Globe, MessageCircle, HelpCircle, History } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { api } from '@/services/api';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Agent, AILifecycleStage } from '@/lib/types';
import { AgentKnowledgeTab } from '@/components/agents/AgentKnowledgeTab';
import { AgentEvolutionTab } from '@/components/agents/AgentEvolutionTab';

export default function Agents() {
  const { openSlideOver, currentTenant, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Agent>>({
    name: '',
    role: 'New Agent',
    riskLevel: 'low',
    lifecycleStage: 'development',
    channels: ['text'],
    status: 'active'
  });

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    async function loadAgents() {
      if (currentTenant) {
        try {
          const data = await api.getAgents(currentTenant.id);
          setAgents(data);
        } catch (error) {
          toast.error('Erro ao carregar agentes');
        }
      }
    }
    loadAgents();
  }, [currentTenant]);

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
    } else {
      setEditingAgent(null);
      setFormData({
        name: '',
        role: 'Assistant',
        riskLevel: 'low',
        lifecycleStage: 'development',
        channels: ['text'],
        status: 'active',
        activeConversations: 0,
        totalConversations: 0
      });
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

    try {
      if (editingAgent) {
        // Update
        const updated = await api.updateAgent(editingAgent.id, {
          ...formData,
          last_actor_name: currentUser?.name || 'Sistema'
        });
        setAgents(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
        toast.success('Agente atualizado com sucesso');
      } else {
        // Create
        const newAgentRef: Partial<Agent> = {
          ...formData,
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
          {/* Agents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="kpi-card hover:shadow-lg transition-all relative cursor-default"
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
                </div>

                {/* Line 2: Governance & Risk */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {/* Risk Badge */}
                  {agent.riskLevel && (
                    <Badge variant="outline" className={`
                      text-[10px] h-5 gap-1 border-0
                      ${agent.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        agent.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}
                    `}>
                      <ShieldAlert className="h-3 w-3" />
                      Risco {agent.riskLevel === 'high' ? 'Crítico' : agent.riskLevel === 'medium' ? 'Médio' : 'Baixo'}
                    </Badge>
                  )}

                  {/* Autonomy Badge */}
                  <Badge variant="outline" className="text-[10px] h-5 gap-1 border-primary/20 text-primary">
                    <Settings className="h-3 w-3" />
                    Autonomia L{agent.autonomyLevel || 1}
                  </Badge>

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
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 }).format(agent.usage.totalCost)
                          : 'R$ 0,0000'}
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

                      {(agent.type === 'whatsapp' || agent.type === 'embedded') && (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono font-bold text-muted-foreground leading-none">
                            {(agent.usage?.totalMessages || 0).toLocaleString()}
                          </span>
                          <span className="text-[9px] text-muted-foreground uppercase">Msgs</span>
                        </div>
                      )}

                      {agent.channels.includes('voice') && (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono font-bold text-muted-foreground leading-none">
                            {((agent.usage?.totalStt || 0) + (agent.usage?.totalTts || 0)).toFixed(1)}
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
                  Configurar
                </Button>
              </div>
            ))}
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
              <Tabs defaultValue="brain" className="w-full">
                <TabsList className="flex w-full justify-start gap-4 px-6 border-b rounded-none h-12 bg-muted/20 sticky top-0 z-10">
                  <TabsTrigger value="brain" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 h-full flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Cérebro & Identidade
                  </TabsTrigger>
                  <TabsTrigger value="integration" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 h-full flex items-center gap-2">
                    <Workflow className="h-4 w-4" />
                    Canais & Integração
                  </TabsTrigger>
                  <TabsTrigger value="governance" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 h-full flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    Governança & Risco
                  </TabsTrigger>
                  <TabsTrigger value="knowledge" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 h-full flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Base de Conhecimento
                  </TabsTrigger>

                  {formData.type === 'whatsapp' && (
                    <TabsTrigger value="evolution" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none bg-transparent shadow-none px-4 h-full flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp (Evolution)
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="brain" className="p-6 space-y-6">
                  <div className="bg-amber-500/10 border border-amber-500/20 p-3 mb-6 rounded-md flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-500">Persistência em Tempo Real</h4>
                      <p className="text-xs text-muted-foreground mt-1 text-[10px]">
                        As configurações de <strong>Prompt, Risco e Autonomia</strong> impactam o comportamento do N8N imediatamente.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 shrink-0">
                    <div className="md:col-span-8 space-y-2">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Identidade da Inteligência</Label>
                      <Input
                        className="text-lg font-semibold h-12 bg-muted/30 border-accent/20 focus:border-accent"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ex: Consultor Estratégico de Vendas"
                      />
                    </div>
                    <div className="md:col-span-4 space-y-2">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Tipo de Agente</Label>
                      <Select
                        value={formData.type || 'conversational'}
                        onValueChange={(v: any) => setFormData({ ...formData, type: v })}
                      >
                        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conversational">Conversacional (Padrão)</SelectItem>
                          <SelectItem value="embedded">Agente Embarcado (Widget)</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp Business API</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 shrink-0">
                    <div className="md:col-span-6 space-y-2">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Modelo LLM (Cérebro)</Label>
                      <Select
                        value={formData.brainConfig?.modelId || 'gpt-4o'}
                        onValueChange={(v: any) => setFormData({
                          ...formData,
                          brainConfig: {
                            ...formData.brainConfig,
                            modelId: v
                          }
                        })}
                      >
                        <SelectTrigger className="h-11 font-mono">
                          <SelectValue placeholder="Selecione o modelo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-5o">gpt-5o</SelectItem>
                          <SelectItem value="gpt-5o-mini">gpt-5o-mini</SelectItem>
                          <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                          <SelectItem value="o1-preview">o1-preview</SelectItem>
                          <SelectItem value="o1-mini">o1-mini</SelectItem>
                          <SelectItem value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-6 space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Temperatura: {formData.brainConfig?.temperature || 0.5}</Label>
                        <span className="text-[10px] text-muted-foreground italic">0.0 (Rígido) &rarr; 1.0 (Criativo)</span>
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
                    <div className="md:col-span-12 space-y-3 p-4 bg-accent/5 border border-accent/10 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Memória Dinâmica (Janela de Contexto)</Label>
                          <p className="text-[10px] text-muted-foreground italic">Define quantas mensagens anteriores a IA deve "lembrar" para manter o contexto.</p>
                        </div>
                        <Badge variant="outline" className="text-accent border-accent/30 bg-accent/5">
                          {formData.contextWindow || 10} mensagens
                        </Badge>
                      </div>
                      <Input
                        type="range"
                        step="1"
                        min="1"
                        max="50"
                        className="h-8 accent-accent cursor-pointer"
                        value={formData.contextWindow || 10}
                        onChange={(e) => setFormData({
                          ...formData,
                          contextWindow: parseInt(e.target.value)
                        })}
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                        <span>Econômico (1)</span>
                        <span>Equilibrado (15)</span>
                        <span>Longa Memória (50)</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col space-y-2 min-h-[300px]">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold secondary-text text-accent uppercase tracking-wider">Prompt de Sistema (Personalidade & Regras)</Label>
                      <Badge variant="outline" className="text-[10px] font-mono border-red-500/30 text-red-500">OBRIGATÓRIO</Badge>
                    </div>
                    <textarea
                      className="flex-1 p-4 font-mono text-sm bg-slate-950 text-slate-100 rounded-md border border-slate-800 focus:ring-2 focus:ring-accent outline-none resize-none leading-relaxed"
                      placeholder="Instrua sua inteligência aqui... Ex: Você é uma assistente de vendas focada em conversão, utilize uma linguagem direta e cordial."
                      value={formData.brainConfig?.systemPrompt || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        brainConfig: {
                          ...formData.brainConfig,
                          systemPrompt: e.target.value
                        }
                      })}
                    ></textarea>
                    <p className="text-[10px] text-muted-foreground">O n8n usará este prompt como base para a personalidade da IA.</p>
                  </div>

                  <div className="flex-1 flex flex-col space-y-2 min-h-[300px]">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold secondary-text text-amber-500 uppercase tracking-wider">Template da Mensagem do Usuário (Motor Burro)</Label>
                      <Badge variant="outline" className="text-[10px] font-mono border-red-500/30 text-red-500">OBRIGATÓRIO</Badge>
                    </div>
                    <textarea
                      className="flex-1 p-4 font-mono text-sm bg-slate-950 text-slate-100 rounded-md border border-slate-800 focus:ring-2 focus:ring-amber-500 outline-none resize-none leading-relaxed"
                      placeholder="Ex: Responda a seguinte dúvida usando o contexto acima: {message}"
                      value={formData.brainConfig?.userPromptTemplate || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        brainConfig: {
                          ...formData.brainConfig,
                          userPromptTemplate: e.target.value
                        }
                      })}
                    ></textarea>
                    <p className="text-[10px] text-muted-foreground">Dica: Use {'{message}'} para que o n8n injete a fala do usuário dinamicamente.</p>
                  </div>
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
                          <p className="text-[10px] opacity-70">Conversas escritas e JSON</p>
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
                          <p className="text-[10px] opacity-70">Ligação em tempo real (Retell)</p>
                        </div>
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Voice Config */}
                    <div className="space-y-4 border border-border/50 p-5 rounded-lg bg-muted/10">
                      <h4 className="text-sm font-bold uppercase flex items-center gap-2 text-muted-foreground">
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
                              <SelectItem value="retell">Retell AI</SelectItem>
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
                            <Label className="text-xs">Retell Agent ID</Label>
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

                    {/* N8N Config */}
                    <div className="space-y-4 border border-border/50 p-5 rounded-lg bg-muted/10">
                      <h4 className="text-sm font-bold uppercase flex items-center gap-2 text-muted-foreground">
                        <Workflow className="h-4 w-4" /> Orquestração (N8N)
                      </h4>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Webhook do N8N</Label>
                          <Input
                            className="h-9 font-mono text-[10px] bg-slate-950 text-accent border-accent/20"
                            value={formData.integrationConfig?.n8n_webhook_url || ''}
                            readOnly
                          />
                          <p className="text-[9px] text-muted-foreground italic leading-tight">
                            Este link conecta o Dashboard ao Motor de Execução n8n, orquestrando fluxos de conversa e lógica de negócio do agente.
                          </p>
                        </div>

                        {formData.type === 'whatsapp' && (
                          <div className="space-y-2 animate-in slide-in-from-top-1">
                            <Label className="text-xs font-bold text-accent">Nome da Instância Evolution</Label>
                            <Input
                              className="h-9 font-mono text-xs bg-muted/30 border-accent/20 focus:border-accent"
                              value={formData.evolution_instance || ''}
                              onChange={(e) => setFormData({ ...formData, evolution_instance: e.target.value })}
                              placeholder="Ex: d Davos-Nexus-Zap"
                            />
                            <p className="text-[9px] text-muted-foreground italic leading-tight">
                              Necessário para que o n8n identifique este agente automaticamente no fluxo de WhatsApp.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="governance" className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-3 p-4 border border-border/50 rounded-lg bg-blue-500/5">
                        <h4 className="text-xs font-bold uppercase text-blue-500 tracking-widest border-b border-blue-500/10 pb-2">Status & Ciclo de Vida</h4>
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
                              value={formData.lifecycleStage}
                              onValueChange={(v: AILifecycleStage) => setFormData({ ...formData, lifecycleStage: v })}
                            >
                              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
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
                              value={formData.status}
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

                      <div className="space-y-3 p-4 border border-border/50 rounded-lg bg-orange-500/5">
                        <h4 className="text-xs font-bold uppercase text-orange-500 tracking-widest border-b border-orange-500/10 pb-2">Segurança & Autonomia</h4>
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
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3 p-4 border border-border/50 rounded-lg bg-muted/5">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-widest border-b border-border/50 pb-2">Matriz de Risco</h4>
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
                              value={formData.riskLevel}
                              onValueChange={(v: any) => setFormData({ ...formData, riskLevel: v })}
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
                    onInstanceLinked={(instanceName, token) => {
                      setFormData(prev => ({
                        ...prev,
                        evolution_instance: instanceName,
                        evolution_token: token
                      }));
                      toast.success('Vínculo preparado. Salve o agente para confirmar.');
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/20">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button className="bg-accent hover:bg-accent/90" onClick={handleSave}>
                {editingAgent ? 'Salvar Alterações' : 'Criar Agente'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout >
  );
}
