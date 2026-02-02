import { Bot, MessageSquare, Phone, Settings, Plus, Search, ShieldAlert, BookOpen, MoreVertical, Trash2, Pencil, Sparkles, Headphones, Workflow, Play } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockAgents } from '@/lib/mock-data';
import { useApp } from '@/contexts/AppContext';
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
import { useState } from 'react';
import { toast } from 'sonner';
import { Agent, AILifecycleStage } from '@/lib/types'; // Importing types

export default function Agents() {
  const { openSlideOver } = useApp();
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState(mockAgents);
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

  const handleOpenDialog = (agent?: Agent) => {
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

  const handleSave = () => {
    if (editingAgent) {
      setAgents(prev => prev.map(a => a.id === editingAgent.id ? { ...a, ...formData } as Agent : a));
      toast.success('Agente atualizado com sucesso');
    } else {
      const newAgent = {
        ...formData,
        id: `agent-${Date.now()}`,
        policies: [],
      } as Agent;
      setAgents(prev => [...prev, newAgent]);
      toast.success('Agente criado com sucesso');
    }
    setIsDialogOpen(false);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setAgents(prev => prev.filter(a => a.id !== id));
    toast.success('Agente removido');
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
                className="kpi-card cursor-pointer hover:shadow-lg transition-all group relative"
                onClick={() => openSlideOver('agent-config', agent)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-accent/10 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">{agent.id}</p>
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
                <div className="flex flex-wrap gap-2 mb-3">
                  {/* Risk Badge */}
                  {agent.riskLevel && (
                    <Badge variant="outline" className={`
                      text-xs gap-1 border-0
                      ${agent.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        agent.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}
                    `}>
                      <ShieldAlert className="h-3 w-3" />
                      Risco {agent.riskLevel === 'high' ? 'Crítico' : agent.riskLevel === 'medium' ? 'Médio' : 'Baixo'}
                    </Badge>
                  )}

                  {/* Lifecycle Badge (ISO 42001) */}
                  {agent.lifecycleStage && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${agent.lifecycleStage === 'production' ? 'bg-green-500' :
                        agent.lifecycleStage === 'development' ? 'bg-blue-500' :
                          agent.lifecycleStage === 'validation' ? 'bg-amber-500' : 'bg-gray-400'
                        }`} />
                      {agent.lifecycleStage.charAt(0).toUpperCase() + agent.lifecycleStage.slice(1)}
                    </Badge>
                  )}

                  {agent.policies && agent.policies.length > 0 && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <BookOpen className="h-3 w-3" />
                      {agent.policies.length} Políticas
                    </Badge>
                  )}

                  {/* Functional Autonomy Badge */}
                  <Badge variant="outline" className="text-xs gap-1 border-primary/20 text-primary">
                    <Settings className="h-3 w-3" />
                    Autonomia L{agent.autonomyLevel || 1}
                  </Badge>
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

                {/* Channels */}
                <div className="flex gap-2 mb-4">
                  {agent.channels.includes('text') && (
                    <Badge variant="secondary" className="gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Texto
                    </Badge>
                  )}
                  {agent.channels.includes('voice') && (
                    <Badge variant="secondary" className="gap-1">
                      <Phone className="h-3 w-3" />
                      Voz
                    </Badge>
                  )}
                </div>

                {/* Functional Stats (Load/Capacity) */}
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
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xl font-bold">{agent.totalConversations.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Vitalício</p>
                  </div>
                </div>

                {/* Action */}
                <Button
                  variant="ghost"
                  className="w-full group-hover:bg-accent group-hover:text-accent-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSlideOver('agent-config', agent);
                  }}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar
                </Button>

                <Button
                  variant="outline"
                  className="w-full mt-2 group-hover:bg-primary group-hover:text-primary-foreground border-primary/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSlideOver('agent-playground', agent);
                  }}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Testar / Simular
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Create/Edit Agent Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
              <DialogTitle>{editingAgent ? 'Editar Agente' : 'Novo Agente'}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1">
                  <TabsTrigger value="general" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    Geral & Governança
                  </TabsTrigger>
                  <TabsTrigger value="brain" className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Cérebro (Prompt)
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2">
                    <Headphones className="h-3.5 w-3.5" />
                    Voz & Integração
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-6 mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2 space-y-2">
                      <Label>Nome do Agente</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ex: Consultor de Vendas"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Estágio do Ciclo de Vida (ISO 42001)</Label>
                      <Select
                        value={formData.lifecycleStage}
                        onValueChange={(v: AILifecycleStage) => setFormData({ ...formData, lifecycleStage: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="development">Development (Sandbox)</SelectItem>
                          <SelectItem value="validation">Validation (Homologação)</SelectItem>
                          <SelectItem value="production">Production (Vivo)</SelectItem>
                          <SelectItem value="monitoring">Monitoring (Assistido)</SelectItem>
                          <SelectItem value="retired">Retired (Arquivado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Status Operacional</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(v: any) => setFormData({ ...formData, status: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo (Atenderá Clientes)</SelectItem>
                          <SelectItem value="inactive">Inativo (Pausado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Risco Inerente</Label>
                      <Select
                        value={formData.riskLevel}
                        onValueChange={(v: any) => setFormData({ ...formData, riskLevel: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixo (Informativo)</SelectItem>
                          <SelectItem value="medium">Médio (Transacional)</SelectItem>
                          <SelectItem value="high">Alto (Financeiro/Saúde)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Score de Risco (0-100)</Label>
                      <Input
                        type="number"
                        value={formData.riskScore || 0}
                        onChange={(e) => setFormData({ ...formData, riskScore: parseInt(e.target.value) })}
                        min={0} max={100}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Nível de Autonomia (1-5)</Label>
                      <Select
                        value={String(formData.autonomyLevel || 1)}
                        onValueChange={(v: string) => setFormData({ ...formData, autonomyLevel: parseInt(v) as any })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">L1 - Assistido (Aprovação)</SelectItem>
                          <SelectItem value="2">L2 - Limitado (Rígido)</SelectItem>
                          <SelectItem value="3" disabled={formData.riskLevel === 'high'}>L3 - Condicional (Misto)</SelectItem>
                          <SelectItem value="4" disabled={formData.riskLevel === 'high'}>L4 - Alta (Autônomo Suv.)</SelectItem>
                          <SelectItem value="5" disabled={formData.riskLevel === 'high' || formData.riskLevel === 'medium'}>L5 - Total (Fully Autonomous)</SelectItem>
                        </SelectContent>
                      </Select>
                      {formData.riskLevel === 'high' && (
                        <p className="text-[10px] text-red-500 italic mt-1">* Autonomia limitada a L2 (Risco Crítico).</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Limite de Concorrência</Label>
                      <Input
                        type="number"
                        value={formData.maxConcurrentConversations || 50}
                        onChange={(e) => setFormData({ ...formData, maxConcurrentConversations: parseInt(e.target.value) })}
                      />
                    </div>

                    <div className="md:col-span-2 space-y-3">
                      <Label>Canais Suportados</Label>
                      <div className="flex gap-4">
                        <Button
                          type="button"
                          variant={formData.channels?.includes('text') ? 'default' : 'outline'}
                          className="flex-1 gap-2"
                          onClick={() => {
                            const current = formData.channels || [];
                            const newer = current.includes('text')
                              ? current.filter(c => c !== 'text')
                              : [...current, 'text'];
                            setFormData({ ...formData, channels: newer as any });
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                          WhatsApp / Texto
                        </Button>
                        <Button
                          type="button"
                          variant={formData.channels?.includes('voice') ? 'default' : 'outline'}
                          className="flex-1 gap-2"
                          onClick={() => {
                            const current = formData.channels || [];
                            const newer = current.includes('voice')
                              ? current.filter(c => c !== 'voice')
                              : [...current, 'voice'];
                            setFormData({ ...formData, channels: newer as any });
                          }}
                        >
                          <Phone className="h-4 w-4" />
                          Voz / Retell AI
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Brain / System Prompt Tab */}
                <TabsContent value="brain" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Modelo LLM</Label>
                        <Select
                          value={formData.brainConfig?.modelId || 'gpt-4o'}
                          onValueChange={(v: any) => setFormData({
                            ...formData,
                            brainConfig: {
                              systemPrompt: formData.brainConfig?.systemPrompt || '',
                              temperature: formData.brainConfig?.temperature || 0.5,
                              modelId: v
                            }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o modelo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o">GPT-4o (OpenAI)</SelectItem>
                            <SelectItem value="gpt-4o-mini">GPT-4o Mini (Rápido)</SelectItem>
                            <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet (Anthropic)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Temperatura / Criatividade ({formData.brainConfig?.temperature || 0.5})</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={formData.brainConfig?.temperature || 0.5}
                          onChange={(e) => setFormData({
                            ...formData,
                            brainConfig: {
                              systemPrompt: formData.brainConfig?.systemPrompt || '',
                              modelId: formData.brainConfig?.modelId || 'gpt-4o',
                              temperature: parseFloat(e.target.value)
                            }
                          })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 h-full">
                      <Label>System Prompt (Personalidade & Regras)</Label>
                      <textarea
                        className="w-full min-h-[300px] p-4 font-mono text-sm bg-slate-950 text-slate-100 rounded-md border border-slate-800 focus:ring-2 focus:ring-accent outline-none"
                        placeholder="Ex: Você é um assistente útil..."
                        value={formData.brainConfig?.systemPrompt || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          brainConfig: {
                            modelId: formData.brainConfig?.modelId || 'gpt-4o',
                            temperature: formData.brainConfig?.temperature || 0.5,
                            systemPrompt: e.target.value
                          }
                        })}
                      ></textarea>
                    </div>
                  </div>
                </TabsContent>

                {/* Voice & Integration Tab */}
                <TabsContent value="voice" className="space-y-6 mt-0">
                  {/* Voice Config */}
                  <div className="space-y-4 border border-border p-4 rounded-md">
                    <h4 className="text-sm font-bold uppercase flex items-center gap-2 text-muted-foreground">
                      <Headphones className="h-4 w-4" /> Configuração de Voz (Retell AI)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Provedor de Voz</Label>
                        <Select
                          value={formData.voiceConfig?.provider || 'none'}
                          onValueChange={(v: any) => setFormData({
                            ...formData,
                            voiceConfig: {
                              ...formData.voiceConfig,
                              provider: v
                            }
                          })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Desativado</SelectItem>
                            <SelectItem value="retell">Retell AI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Cenário (Ambient Sound)</Label>
                        <Select
                          value={formData.voiceConfig?.ambientSound || 'clean'}
                          onValueChange={(v: any) => setFormData({
                            ...formData,
                            voiceConfig: {
                              ...formData.voiceConfig,
                              ambientSound: v
                            }
                          })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="clean">Estúdio (Limpo)</SelectItem>
                            <SelectItem value="office">Escritório</SelectItem>
                            <SelectItem value="coffee-shop">Cafeteria</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Retell Agent ID</Label>
                        <Input
                          placeholder="ag_..."
                          value={formData.voiceConfig?.retellAgentId || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            voiceConfig: { ...formData.voiceConfig, retellAgentId: e.target.value } as any
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Voice ID (ElevenLabs/OpenAI)</Label>
                        <Input
                          placeholder="voice_..."
                          value={formData.voiceConfig?.voiceId || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            voiceConfig: { ...formData.voiceConfig, voiceId: e.target.value } as any
                          })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Integration Config (N8N) */}
                  <div className="space-y-4 border border-border p-4 rounded-md bg-muted/20">
                    <h4 className="text-sm font-bold uppercase flex items-center gap-2 text-muted-foreground">
                      <Workflow className="h-4 w-4" />
                      Orquestração (N8N)
                    </h4>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Webhook (WhatsApp/Text)</Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={`https://n8n.davos.nexus/webhook/tenant-slug/${editingAgent?.id || 'new-agent'}/message.received`}
                              className="bg-muted font-mono text-[10px] h-8"
                            />
                            <Button variant="outline" size="sm" className="h-8" onClick={() => {
                              const url = `https://n8n.davos.nexus/webhook/tenant-slug/${editingAgent?.id || 'new-agent'}/message.received`;
                              navigator.clipboard.writeText(url);
                              toast.success('URL copiada');
                            }}>Copy</Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Webhook (Voice/Retell)</Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={`https://n8n.davos.nexus/webhook/tenant-slug/${editingAgent?.id || 'new-agent'}/call.started`}
                              className="bg-muted font-mono text-[10px] h-8"
                            />
                            <Button variant="outline" size="sm" className="h-8" onClick={() => {
                              const url = `https://n8n.davos.nexus/webhook/tenant-slug/${editingAgent?.id || 'new-agent'}/call.started`;
                              navigator.clipboard.writeText(url);
                              toast.success('URL copiada');
                            }}>Copy</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
