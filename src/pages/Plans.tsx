import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import {
    CreditCard, Plus, Search, Edit2, Trash2, Check, X, AlertCircle, Info, TrendingUp, DollarSign, Zap, MessageSquare, Mic, Volume2, Users, Bot, History
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { api } from '@/services/api';
import { useApp } from '@/contexts/AppContext';
import { PlanCatalog } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
    DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

const DEFAULT_PLAN_CONFIG: Partial<PlanCatalog> = {
    name: '',
    type: 'fixed',
    description: '',
    basePrice: 0,
    monthlyFeeCoversUsage: false,
    llmTokenPrice: 0,
    messagePrice: 0,
    sttMinutePrice: 0,
    ttsMinutePrice: 0,
    defaultLimits: {
        llmTokens: 1000000,
        messages: 10000,
        sttMinutes: 100,
        ttsMinutes: 100,
        agents: 5,
        users: 10
    }
};

export default function Plans() {
    const { openSlideOver } = useApp();
    const [plans, setPlans] = useState<PlanCatalog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<PlanCatalog | null>(null);
    const [newPlan, setNewPlan] = useState<Partial<PlanCatalog>>(DEFAULT_PLAN_CONFIG);

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        const data = await api.getPlans();
        setPlans(data);
    };

    const filteredPlans = plans.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSavePlan = async () => {
        if (editingPlan) {
            await api.updatePlan(editingPlan);
            toast.success('Plano atualizado com sucesso');
        } else {
            const planToCreate = {
                ...newPlan,
                id: `plan-${Date.now()}` // Backend could generate this too, but keeping client-side ID for simplicity per mock
            } as PlanCatalog;

            await api.createPlan(planToCreate);
            toast.success('Plano criado no catálogo global');
        }
        await loadPlans();
        setDialogOpen(false);
        setEditingPlan(null);
        setNewPlan(DEFAULT_PLAN_CONFIG);
    };

    const getTypeBadge = (type: string) => {
        switch (type) {
            case 'flex':
                return <Badge className="bg-blue-600">Flex (Pay-as-you-go)</Badge>;
            case 'unlimited':
                return <Badge className="bg-purple-600">Unlimited (Geral)</Badge>;
            default:
                return <Badge variant="secondary">Fixado (Quota)</Badge>;
        }
    };

    return (
        <MainLayout>
            <div className="h-full flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border bg-background sticky top-0 z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold">Catálogo de Planos</h1>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Info className="h-3 w-3" />
                                Definição de precificação e limites padrão para novos Tenants
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar planos..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            <Button onClick={() => {
                                setEditingPlan(null);
                                setNewPlan(DEFAULT_PLAN_CONFIG);
                                setDialogOpen(true);
                            }} className="bg-accent hover:bg-accent/90">
                                <Plus className="h-4 w-4 mr-2" />
                                Novo Plano
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredPlans.map((plan) => (
                            <div key={plan.id} className="bg-card border border-border overflow-hidden flex flex-col group hover:border-accent/50 transition-colors">
                                <div className="p-5 border-b border-border bg-muted/30">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg">{plan.name}</h3>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-accent"
                                                onClick={() => {
                                                    setEditingPlan(plan);
                                                    setDialogOpen(true);
                                                }}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-accent"
                                                onClick={() => openSlideOver('plan-history', plan)}
                                                title="Ver Histórico de Alterações"
                                            >
                                                <History className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="mb-2">
                                        {getTypeBadge(plan.type)}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                                        {plan.description}
                                    </p>
                                </div>

                                <div className="p-5 space-y-4 flex-1">
                                    {/* Pricing Overview */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <DollarSign className="h-4 w-4 text-accent" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Precificação Corporativa</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground">Mensalidade</span>
                                                <span className="font-bold">R$ {plan.basePrice.toLocaleString('pt-BR')}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground">Tokens (1k)</span>
                                                <span className="font-medium text-xs">R$ {plan.llmTokenPrice.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground">Mensagem</span>
                                                <span className="font-medium text-xs">R$ {plan.messagePrice.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground">Voz (Total/min)</span>
                                                <span className="font-bold text-accent">R$ {(plan.sttMinutePrice + plan.ttsMinutePrice).toFixed(2)}</span>
                                            </div>
                                            <div className="col-span-2 flex justify-end gap-2 mt-0.5">
                                                <span className="text-[10px] text-muted-foreground">STT: R$ {plan.sttMinutePrice.toFixed(2)}</span>
                                                <span className="text-[10px] text-muted-foreground">TTS: R$ {plan.ttsMinutePrice.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* Provisioning Limits */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <TrendingUp className="h-4 w-4 text-accent" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Provisionamento (Cota Padrão)</span>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-muted/50 p-2 text-center rounded-sm">
                                                <p className="text-sm font-bold">{(plan.defaultLimits.llmTokens / 1000000).toFixed(1)}M</p>
                                                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                                                    <Zap className="h-2 w-2" /> Tokens
                                                </p>
                                            </div>
                                            <div className="bg-muted/50 p-2 text-center rounded-sm">
                                                <p className="text-sm font-bold">{(plan.defaultLimits.messages / 1000).toFixed(0)}k</p>
                                                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                                                    <MessageSquare className="h-2 w-2" /> Msgs
                                                </p>
                                            </div>
                                            <div className="bg-muted/50 p-2 text-center rounded-sm">
                                                <p className="text-sm font-bold">{plan.defaultLimits.agents}</p>
                                                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                                                    <Bot className="h-2 w-2" /> Agentes
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-muted/20 border-t border-border mt-auto">
                                    <div className="flex justify-between items-center opacity-70">
                                        <span className="text-[10px] font-mono text-muted-foreground">ID: {plan.id}</span>
                                        <span className="text-[10px] text-accent uppercase font-bold tracking-tight">Contract Ready</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Create/Edit Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <div className="flex items-center justify-between">
                                <DialogTitle>{editingPlan ? 'Configurar Plano do Catálogo' : 'Definir Novo Plano de Serviço'}</DialogTitle>
                                {editingPlan && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2 text-accent"
                                        onClick={() => openSlideOver('plan-history', editingPlan)}
                                    >
                                        <History className="h-4 w-4" />
                                        Ver Histórico
                                    </Button>
                                )}
                            </div>
                            <DialogDescription>
                                Configure os detalhes técnicos, precificação e limites operacionais do plano.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                            {/* Basic Info */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold uppercase text-accent">Dados Gerais</h4>
                                <div className="space-y-2">
                                    <Label>Nome do Plano</Label>
                                    <Input
                                        value={editingPlan ? editingPlan.name : newPlan.name}
                                        onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, name: e.target.value }) : setNewPlan({ ...newPlan, name: e.target.value })}
                                        placeholder="Ex: Enterprise Premium"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Tipo de Faturamento</Label>
                                    <Select
                                        value={editingPlan ? editingPlan.type : newPlan.type}
                                        onValueChange={(val: any) => editingPlan ? setEditingPlan({ ...editingPlan, type: val }) : setNewPlan({ ...newPlan, type: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="fixed">Fixado (Quota pré-paga)</SelectItem>
                                            <SelectItem value="flex">Flexível (Pagamento por uso)</SelectItem>
                                            <SelectItem value="unlimited">Ilimitado (Geral/Global)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Descrição Pública</Label>
                                    <Textarea
                                        value={editingPlan ? editingPlan.description : newPlan.description}
                                        onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, description: e.target.value }) : setNewPlan({ ...newPlan, description: e.target.value })}
                                        className="h-20"
                                        placeholder="Texto que aparecerá para o cliente..."
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-card mt-2">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Mensalidade converte em Crédito?</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Se ativo, o valor da mensalidade (R${editingPlan?.basePrice || newPlan.basePrice}) é usado como saldo para abater o consumo.
                                            Se inativo, o consumo é cobrado à parte (Mensalidade + Uso).
                                        </p>
                                    </div>
                                    <Switch
                                        checked={editingPlan ? !!editingPlan.monthlyFeeCoversUsage : !!newPlan.monthlyFeeCoversUsage}
                                        onCheckedChange={(checked) => editingPlan ? setEditingPlan({ ...editingPlan, monthlyFeeCoversUsage: checked }) : setNewPlan({ ...newPlan, monthlyFeeCoversUsage: checked })}
                                    />
                                </div>

                                <div className="space-y-4 pt-4 border-t border-border">
                                    <h4 className="text-sm font-bold uppercase text-accent">Precificação (Custos Unitários)</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Mensalidade Base (R$)</Label>
                                            <Input
                                                type="number"
                                                value={editingPlan ? editingPlan.basePrice : newPlan.basePrice}
                                                onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, basePrice: Number(e.target.value) }) : setNewPlan({ ...newPlan, basePrice: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Preço 1k Tokens (R$)</Label>
                                            <Input
                                                type="number" step="0.01"
                                                value={editingPlan ? editingPlan.llmTokenPrice : newPlan.llmTokenPrice}
                                                onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, llmTokenPrice: Number(e.target.value) }) : setNewPlan({ ...newPlan, llmTokenPrice: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Preço Mensagem (R$)</Label>
                                            <Input
                                                type="number" step="0.01"
                                                value={editingPlan ? editingPlan.messagePrice : newPlan.messagePrice}
                                                onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, messagePrice: Number(e.target.value) }) : setNewPlan({ ...newPlan, messagePrice: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Voz STT (Minuto R$)</Label>
                                            <Input
                                                type="number" step="0.01"
                                                value={editingPlan ? editingPlan.sttMinutePrice : newPlan.sttMinutePrice}
                                                onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, sttMinutePrice: Number(e.target.value) }) : setNewPlan({ ...newPlan, sttMinutePrice: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Voz TTS (Minuto R$)</Label>
                                            <Input
                                                type="number" step="0.01"
                                                value={editingPlan ? editingPlan.ttsMinutePrice : newPlan.ttsMinutePrice}
                                                onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, ttsMinutePrice: Number(e.target.value) }) : setNewPlan({ ...newPlan, ttsMinutePrice: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="col-span-2 p-3 bg-accent/5 border border-accent/20 rounded-lg flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-accent uppercase tracking-wider">Custo Total de Voz</span>
                                                <span className="text-[10px] text-muted-foreground">Preço final por minuto físico de ligação (Soma de STT + TTS)</span>
                                            </div>
                                            <div className="text-lg font-mono font-bold text-accent">
                                                R$ {((editingPlan ? editingPlan.sttMinutePrice : (newPlan.sttMinutePrice || 0)) + (editingPlan ? editingPlan.ttsMinutePrice : (newPlan.ttsMinutePrice || 0))).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Default Limits */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold uppercase text-accent">Limites Iniciais (Provisionamento)</h4>
                                <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 border border-border">
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Zap className="h-3 w-3" /> Tokens LLM
                                        </Label>
                                        <Input
                                            type="number"
                                            value={editingPlan ? editingPlan.defaultLimits.llmTokens : newPlan.defaultLimits?.llmTokens}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                if (editingPlan) {
                                                    setEditingPlan({ ...editingPlan, defaultLimits: { ...editingPlan.defaultLimits, llmTokens: val } });
                                                } else {
                                                    setNewPlan({ ...newPlan, defaultLimits: { ...newPlan.defaultLimits!, llmTokens: val } });
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <MessageSquare className="h-3 w-3" /> Mensagens
                                        </Label>
                                        <Input
                                            type="number"
                                            value={editingPlan ? editingPlan.defaultLimits.messages : newPlan.defaultLimits?.messages}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                if (editingPlan) {
                                                    setEditingPlan({ ...editingPlan, defaultLimits: { ...editingPlan.defaultLimits, messages: val } });
                                                } else {
                                                    setNewPlan({ ...newPlan, defaultLimits: { ...newPlan.defaultLimits!, messages: val } });
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Mic className="h-3 w-3" /> Minutos Voice
                                        </Label>
                                        <Input
                                            type="number"
                                            value={editingPlan ? editingPlan.defaultLimits.sttMinutes : newPlan.defaultLimits?.sttMinutes}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                if (editingPlan) {
                                                    setEditingPlan({ ...editingPlan, defaultLimits: { ...editingPlan.defaultLimits, sttMinutes: val, ttsMinutes: val } });
                                                } else {
                                                    setNewPlan({ ...newPlan, defaultLimits: { ...newPlan.defaultLimits!, sttMinutes: val, ttsMinutes: val } });
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Bot className="h-3 w-3" /> Agentes
                                        </Label>
                                        <Input
                                            type="number"
                                            value={editingPlan ? editingPlan.defaultLimits.agents : newPlan.defaultLimits?.agents}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                if (editingPlan) {
                                                    setEditingPlan({ ...editingPlan, defaultLimits: { ...editingPlan.defaultLimits, agents: val } });
                                                } else {
                                                    setNewPlan({ ...newPlan, defaultLimits: { ...newPlan.defaultLimits!, agents: val } });
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Users className="h-3 w-3" /> Usuários
                                        </Label>
                                        <Input
                                            type="number"
                                            value={editingPlan ? editingPlan.defaultLimits.users : newPlan.defaultLimits?.users}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                if (editingPlan) {
                                                    setEditingPlan({ ...editingPlan, defaultLimits: { ...editingPlan.defaultLimits, users: val } });
                                                } else {
                                                    setNewPlan({ ...newPlan, defaultLimits: { ...newPlan.defaultLimits!, users: val } });
                                                }
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
                                    <div className="flex gap-2">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <div>
                                            <p className="font-bold mb-1">Nota de Provisionamento:</p>
                                            <p>Estes limites serão aplicados automaticamente ao criar uma nova empresa com este plano. Mudanças aqui não afetam empresas já existentes (retroatividade bloqueada).</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="mt-6">
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSavePlan} className="bg-accent hover:bg-accent/90">
                                <Check className="h-4 w-4 mr-2" />
                                Validar e Publicar no Catálogo
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </MainLayout>
    );
}
