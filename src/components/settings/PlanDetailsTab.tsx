import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Company } from '@/lib/types';
import { Check, Info, ShieldCheck, Zap, Server, Activity, ArrowUpRight } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export function PlanDetailsTab() {
    const { currentTenant } = useApp();
    const [usage, setUsage] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (currentTenant) {
            setLoading(true);
            api.getTenantUsage(currentTenant.id)
                .then(setUsage)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [currentTenant]);

    if (!currentTenant) return null;

    const plan = currentTenant.planDetails || {};
    const limits = currentTenant.limits || {};
    const prices = currentTenant.planPrices || {};
    const totalWhatsappWindows = Number(usage?.total_whatsapp_windows || 0);
    const totalMessageUnits = Number(usage?.total_messages || 0) + totalWhatsappWindows;
    const whatsappWindowPrice = Number(prices.whatsappWindowPrice || 0);

    // Calculate percentages
    const tokenLimit = limits.llmTokens || 1000000;
    const tokenUsage = Number(usage?.total_tokens || 0);
    const tokenPct = Math.min(100, (tokenUsage / tokenLimit) * 100);

    const sttLimit = limits.sttMinutes || 1000;
    const sttUsage = Number(usage?.stt_minutes || 0);
    const sttPct = Math.min(100, (sttUsage / sttLimit) * 100);

    const ttsLimit = limits.ttsMinutes || 1000;
    const ttsUsage = Number(usage?.tts_minutes || 0);
    const ttsPct = Math.min(100, (ttsUsage / ttsLimit) * 100);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const getUsageColor = (pct: number) => {
        if (pct >= 90) return 'bg-red-500';
        if (pct >= 75) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* HEADER: Plan Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-background to-muted/20 p-6">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <ShieldCheck className="w-32 h-32" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <Badge variant="outline" className="text-xs uppercase tracking-widest border-primary/50 text-primary">
                                Plano Ativo
                            </Badge>
                            {currentTenant.status === 'trial' && (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20">
                                    Período de Testes
                                </Badge>
                            )}
                        </div>

                        <h2 className="text-3xl font-bold tracking-tight mb-2">
                            {currentTenant.planName || 'Enterprise Custom'}
                        </h2>

                        <p className="text-muted-foreground max-w-lg mb-6">
                            Este plano inclui acesso total à plataforma Davos Nexus com suporte prioritário e infraestrutura dedicada de IA.
                        </p>

                        <div className="flex flex-wrap gap-4">
                            <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground uppercase">Valor Base</span>
                                <span className="text-xl font-mono font-semibold">{formatCurrency(prices.basePrice || 0)}<span className="text-xs text-muted-foreground">/mês</span></span>
                            </div>
                            <div className="w-[1px] h-10 bg-border" />
                            <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground uppercase">Renovação</span>
                                <span className="text-sm font-medium mt-1">Dia 01 de cada mês</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI Card: Current Month Cost (Estimate) */}
                <div className="rounded-xl border border-border bg-background p-6 flex flex-col justify-between relative overflow-hidden group hover:border-primary/50 transition-colors">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Custo Variável (Est.)</span>
                            <Activity className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-3xl font-mono font-bold tracking-tighter">
                            {formatCurrency(
                                (usage?.total_tokens / 1000 * (prices.llmTokenPrice || 0)) +
                                (usage?.stt_minutes * (prices.sttMinutePrice || 0)) +
                                (usage?.tts_minutes * (prices.ttsMinutePrice || 0)) +
                                (Number(usage?.total_messages || 0) * (prices.messagePrice || 0)) +
                                (totalWhatsappWindows * whatsappWindowPrice)
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Baseado no consumo atual. Não inclui taxa base.
                        </p>
                    </div>

                    <Button variant="outline" size="sm" className="w-full mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        Ver Fatura Detalhada <ArrowUpRight className="w-3 h-3 ml-2" />
                    </Button>
                </div>
            </div>

            <Separator />

            {/* CONSUMPTION SECTION */}
            <h3 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Consumo vs. Limites
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* LLM Tokens */}
                <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500">
                                <Server className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-sm">Processamento IA (Tokens)</span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                            {tokenUsage.toLocaleString()} / {tokenLimit.toLocaleString()}
                        </span>
                    </div>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden cursor-help">
                                    <div
                                        className={`h-full ${getUsageColor(tokenPct)} transition-all duration-1000 ease-out`}
                                        style={{ width: `${tokenPct}%` }}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Custo excedente: {formatCurrency(prices.llmTokenPrice || 0)} / 1k tokens</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <p className="text-xs text-muted-foreground text-right">{tokenPct.toFixed(1)}% utilizado</p>
                </div>

                {/* Voice Input (STT) */}
                <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-500">
                                <Activity className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-sm">Entrada de Voz (STT)</span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                            {sttUsage.toFixed(1)} / {sttLimit.toLocaleString()} min
                        </span>
                    </div>

                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className={`h-full ${getUsageColor(sttPct)} transition-all duration-1000 ease-out`}
                            style={{ width: `${sttPct}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{sttPct.toFixed(1)}% utilizado</p>
                </div>

                {/* Voice Output (TTS) */}
                <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-pink-500/10 text-pink-500">
                                <Activity className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-sm">Saída de Voz (TTS)</span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                            {ttsUsage.toFixed(1)} / {ttsLimit.toLocaleString()} min
                        </span>
                    </div>

                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className={`h-full ${getUsageColor(ttsPct)} transition-all duration-1000 ease-out`}
                            style={{ width: `${ttsPct}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{ttsPct.toFixed(1)}% utilizado</p>
                </div>

                {/* Messages */}
                <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500">
                                <Zap className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-sm">Unidades de Mensageria</span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                            {totalMessageUnits.toLocaleString()}
                        </span>
                    </div>

                    <div className="flex items-center justify-between text-xs py-1">
                        <span className="text-muted-foreground">Custo Unitário</span>
                        <Badge variant="outline" className="font-mono">
                            {totalWhatsappWindows > 0 && prices.whatsappOfficialBillingMode === 'window_24h'
                                ? `${formatCurrency(prices.messagePrice || 0)} / msg | ${formatCurrency(whatsappWindowPrice)} / janela`
                                : formatCurrency(prices.messagePrice || 0)}
                        </Badge>
                    </div>
                    {totalWhatsappWindows > 0 && (
                        <p className="text-xs text-muted-foreground text-right">
                            {Number(usage?.total_messages || 0).toLocaleString()} mensagens + {totalWhatsappWindows.toLocaleString()} janelas oficiais.
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground text-right">Sem limite (Pay-as-you-go)</p>
                </div>

            </div>

            <Separator />

            {/* PLAN FEATURES INCLUDED */}
            <h3 className="text-lg font-semibold">Funcionalidades Inclusas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    'Acesso a Modelos GPT-4o e Claude 3.5',
                    'Suporte a WhatsApp Business API',
                    'Voz Neural HD (ElevenLabs/OpenAI)',
                    'Painel de Analytics Avançado',
                    'Gestão de Equipe (RBAC)',
                    'Logs de Auditoria de 90 dias',
                    'Suporte via Email Prioritário',
                    'API de Integração (Webhooks)',
                    'Backup Diário Automático'
                ].map((feature, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-md hover:bg-muted/50 transition-colors">
                        <div className="mt-0.5 bg-primary/10 text-primary rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                        </div>
                        <span className="text-sm">{feature}</span>
                    </div>
                ))}
            </div>

        </div>
    );
}
