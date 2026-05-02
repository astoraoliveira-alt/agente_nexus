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
    whatsappOfficialBillingMode: 'per_message',
    whatsappWindowPrice: 0,
    whatsappOfficialProviders: ['meta', 'zenvia'],
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
    const currentPlan = editingPlan ?? newPlan;

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
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
                        <DialogHeader>
                            <div className="border-b border-border bg-muted/20 px-6 py-5">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-1">
                                        <DialogTitle className="text-2xl font-semibold tracking-tight">
                                            {editingPlan ? 'Configurar Plano do Catálogo' : 'Definir Novo Plano de Serviço'}
                                        </DialogTitle>
                                        <DialogDescription className="max-w-2xl text-sm leading-6">
                                            Configure os detalhes técnicos, a estratégia comercial e os limites operacionais do plano em uma única visão.
                                        </DialogDescription>
                                    </div>
                                    {editingPlan && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2 self-start border-accent/20 text-accent hover:bg-accent/5"
                                            onClick={() => openSlideOver('plan-history', editingPlan)}
                                        >
                                            <History className="h-4 w-4" />
                                            Ver Histórico
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="space-y-6 px-6 py-6">
                            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
                                <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-bold uppercase tracking-wide text-accent">Dados Gerais</h4>
                                        <p className="text-xs text-muted-foreground">Defina o posicionamento comercial e a regra-base do plano.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2 md:col-span-2">
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
                                            <Label>Mensalidade Base (R$)</Label>
                                            <Input
                                                type="number"
                                                value={editingPlan ? editingPlan.basePrice : newPlan.basePrice}
                                                onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, basePrice: Number(e.target.value) }) : setNewPlan({ ...newPlan, basePrice: Number(e.target.value) })}
                                            />
                                        </div>

                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Descrição Pública</Label>
                                            <Textarea
                                                value={editingPlan ? editingPlan.description : newPlan.description}
                                                onChange={(e) => editingPlan ? setEditingPlan({ ...editingPlan, description: e.target.value }) : setNewPlan({ ...newPlan, description: e.target.value })}
                                                className="min-h-24"
                                                placeholder="Texto que aparecerá para o cliente..."
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-sm font-semibold">Mensalidade converte em crédito</Label>
                                            <p className="text-xs leading-5 text-muted-foreground max-w-xl">
                                                Se ativo, o valor da mensalidade (R${editingPlan?.basePrice || newPlan.basePrice}) é usado como saldo para abater o consumo.
                                                Se inativo, o consumo é cobrado à parte.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={editingPlan ? !!editingPlan.monthlyFeeCoversUsage : !!newPlan.monthlyFeeCoversUsage}
                                            onCheckedChange={(checked) => editingPlan ? setEditingPlan({ ...editingPlan, monthlyFeeCoversUsage: checked }) : setNewPlan({ ...newPlan, monthlyFeeCoversUsage: checked })}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-bold uppercase tracking-wide text-accent">Limites Iniciais</h4>
                                        <p className="text-xs text-muted-foreground">Provisionamento padrão aplicado a novas empresas vinculadas a este plano.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
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
                                        <div className="space-y-2 col-span-2 md:col-span-1">
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

                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                                        <div className="flex gap-2">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <div>
                                                <p className="font-bold mb-1">Nota de Provisionamento</p>
                                                <p>Estes limites serão aplicados automaticamente ao criar uma nova empresa com este plano. Mudanças aqui não afetam empresas já existentes.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold uppercase tracking-wide text-accent">Precificação Operacional</h4>
                                    <p className="text-xs text-muted-foreground">Custos unitários que alimentam monitoramento, consumo e faturamento contratual.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
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
                                    <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 flex flex-col justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-accent">Custo Total de Voz</span>
                                        <span className="text-[10px] text-muted-foreground">STT + TTS por minuto físico</span>
                                        <div className="pt-3 text-2xl font-mono font-bold text-accent">
                                            R$ {((editingPlan ? editingPlan.sttMinutePrice : (newPlan.sttMinutePrice || 0)) + (editingPlan ? editingPlan.ttsMinutePrice : (newPlan.ttsMinutePrice || 0))).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-5 shadow-sm">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold uppercase tracking-wide text-emerald-700">WhatsApp Oficial</h4>
                                    <p className="text-xs text-emerald-700/80">Configuração específica para billing por canal oficial da Meta e parceiros oficiais, sem impactar o modelo padrão por mensagem.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr] gap-4">
                                    <div className="space-y-2">
                                        <Label>Modelo de Cobrança</Label>
                                        <Select
                                            value={currentPlan.whatsappOfficialBillingMode || 'per_message'}
                                            onValueChange={(val: 'per_message' | 'window_24h') =>
                                                editingPlan
                                                    ? setEditingPlan({ ...editingPlan, whatsappOfficialBillingMode: val })
                                                    : setNewPlan({ ...newPlan, whatsappOfficialBillingMode: val })
                                            }
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue placeholder="Selecione o modelo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="per_message">Por mensagem/interação</SelectItem>
                                                <SelectItem value="window_24h">Por janela de 24h</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Preço Janela 24h (R$)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="bg-white"
                                            value={currentPlan.whatsappWindowPrice ?? 0}
                                            disabled={(currentPlan.whatsappOfficialBillingMode || 'per_message') !== 'window_24h'}
                                            onChange={(e) =>
                                                editingPlan
                                                    ? setEditingPlan({ ...editingPlan, whatsappWindowPrice: Number(e.target.value) })
                                                    : setNewPlan({ ...newPlan, whatsappWindowPrice: Number(e.target.value) })
                                            }
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Provedores Oficiais Cobertos</Label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <label className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    className="accent-emerald-600"
                                                    checked={(currentPlan.whatsappOfficialProviders || []).includes('meta')}
                                                    onChange={(e) => {
                                                        const providers = new Set(currentPlan.whatsappOfficialProviders || []);
                                                        if (e.target.checked) providers.add('meta');
                                                        else providers.delete('meta');
                                                        const next = Array.from(providers) as ('meta' | 'zenvia')[];
                                                        if (editingPlan) {
                                                            setEditingPlan({ ...editingPlan, whatsappOfficialProviders: next });
                                                        } else {
                                                            setNewPlan({ ...newPlan, whatsappOfficialProviders: next });
                                                        }
                                                    }}
                                                />
                                                Meta Oficial
                                            </label>

                                            <label className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    className="accent-emerald-600"
                                                    checked={(currentPlan.whatsappOfficialProviders || []).includes('zenvia')}
                                                    onChange={(e) => {
                                                        const providers = new Set(currentPlan.whatsappOfficialProviders || []);
                                                        if (e.target.checked) providers.add('zenvia');
                                                        else providers.delete('zenvia');
                                                        const next = Array.from(providers) as ('meta' | 'zenvia')[];
                                                        if (editingPlan) {
                                                            setEditingPlan({ ...editingPlan, whatsappOfficialProviders: next });
                                                        } else {
                                                            setNewPlan({ ...newPlan, whatsappOfficialProviders: next });
                                                        }
                                                    }}
                                                />
                                                Zenvia
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-emerald-200 bg-white/70 p-4 text-xs leading-5 text-emerald-800">
                                    Quando configurado como janela de 24h, a primeira mensagem outbound oficial abre a unidade faturável.
                                    Mensagens adicionais dentro da mesma janela não geram nova cobrança até o vencimento.
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="mt-0 border-t border-border bg-muted/20 px-6 py-4">
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
