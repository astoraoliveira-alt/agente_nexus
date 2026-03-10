import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, TrendingUp, TrendingDown, Activity, ShieldAlert, Target, HelpCircle } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface ContactStatsHeaderProps {
    contacts: any[];
}

export const ContactStatsHeader: React.FC<ContactStatsHeaderProps> = ({ contacts }) => {
    // 1. Hallucination Drift (Taxa de alucinação ou resposta inadequada)
    const driftContacts = contacts.filter(c =>
        c.tags?.some((t: string) => ['alucinação', 'resposta_inadequada', 'efficiency_issue'].includes(t.toLowerCase()))
    );
    const driftRate = contacts.length > 0 ? (driftContacts.length / contacts.length) * 100 : 0;

    // Mock Trend Data for Sparklines (In a real app, this would come from the API)
    const mockTrendData = [
        { value: 10 }, { value: 15 }, { value: 8 }, { value: 20 }, { value: 12 }, { value: 18 }, { value: driftRate }
    ];

    // 2. Sentiment Trend (Success rate vs Friction)
    const successContacts = contacts.filter(c => c.tags?.some((t: string) => t.toLowerCase() === 'success'));
    const frictionContacts = contacts.filter(c =>
        c.tags?.some((t: string) => ['frustração_usuario', 'complaint', 'user_confusion'].includes(t.toLowerCase()))
    );
    const sentimentScore = contacts.length > 0
        ? ((successContacts.length - frictionContacts.length) / contacts.length) * 50 + 50
        : 75;

    // 3. Lead Heat (Lead Quente %)
    const hotLeads = contacts.filter(c => ['Lead Quente', 'sql', 'SQL'].includes(c.lifecycleStatus || ''));
    const conversionRate = contacts.length > 0 ? (hotLeads.length / contacts.length) * 100 : 0;

    // 4. Critical Compliance Gap
    const complianceIssues = contacts.filter(c => c.tags?.some((t: string) => t.toLowerCase() === 'compliance'));
    const criticalCount = complianceIssues.length; // Simplified for this view

    const tooltips = {
        drift: "Mede a porcentagem de conversas que apresentaram alucinações, respostas fora de contexto ou falhas técnicas do agente IA.",
        nps: "Cálculo baseado na análise de sentimento das interações, cruzando casos de sucesso vs. frustração ou confusão do cliente.",
        conversion: "Percentual de contatos identificados como 'Leads Quentes' (SQL) em relação ao total de chamadas processadas.",
        compliance: "Monitoramento automático de conformidade (ISO 42001) para identificar promessas indevidas, ofensas ou desvios críticos."
    };

    return (
        <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* CARD 1: HALLUCINATION DRIFT */}
                <Card className="bg-card border-border border-l-4 border-l-[#FF4D00] rounded-none shadow-sm overflow-hidden relative group text-card-foreground">
                    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity text-[#FF4D00]">
                        <Activity className="h-10 w-10" />
                    </div>
                    <div className="p-5 relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-3.5 w-3.5 text-[#FF4D00]" />
                                <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF4D00] uppercase">Drift Reliability</span>
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/40 cursor-help hover:text-muted-foreground transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[200px] text-xs">
                                    {tooltips.drift}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-3xl font-mono font-bold leading-none">
                                {driftRate.toFixed(1)}%
                            </h2>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Respostas Inadequadas</p>
                            <div className="h-10 mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={mockTrendData}>
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#FF4D00"
                                            strokeWidth={1.5}
                                            dot={false}
                                            isAnimationActive={true}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* CARD 2: SENTIMENT TREND */}
                <Card className="bg-card border-border border-l-4 border-l-slate-300 dark:border-l-slate-700 rounded-none shadow-sm overflow-hidden relative text-card-foreground">
                    <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">NPS Estimado</span>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/40 cursor-help hover:text-muted-foreground transition-colors" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">
                                        {tooltips.nps}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            {sentimentScore > 70 ? (
                                <TrendingUp className="h-3.5 w-3.5 text-[#00FF41]" />
                            ) : (
                                <TrendingDown className="h-3.5 w-3.5 text-orange-500" />
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-3xl font-mono font-bold">{sentimentScore.toFixed(0)}</span>
                                <span className="text-[10px] text-muted-foreground font-bold">/ 100</span>
                            </div>
                            <div className="h-1.5 w-full bg-secondary overflow-hidden flex">
                                <div
                                    className={`h-full transition-all duration-1000 ${sentimentScore > 70 ? 'bg-[#00FF41]' : 'bg-orange-500'}`}
                                    style={{ width: `${sentimentScore}%` }}
                                />
                            </div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-tight font-bold">
                                {sentimentScore > 70 ? 'Sentimento Positivo' : 'Atrito em Elevação'}
                            </p>
                        </div>
                    </div>
                </Card>

                {/* CARD 3: LEAD HEAT */}
                <Card className="bg-card border-border border-l-4 border-l-slate-300 dark:border-l-slate-700 rounded-none shadow-sm overflow-hidden relative group text-card-foreground">
                    <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Eficácia Conv.</span>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/40 cursor-help hover:text-muted-foreground transition-colors" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">
                                        {tooltips.conversion}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <Target className="h-3.5 w-3.5 text-[#00FF41]" />
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-3xl font-mono font-bold">{conversionRate.toFixed(1)}%</h3>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                                    <div
                                        key={i}
                                        className={`h-3 flex-1 transition-colors duration-500 ${i <= conversionRate / 10 ? 'bg-[#00FF41]' : 'bg-secondary'}`}
                                    />
                                ))}
                            </div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-tight font-bold">Leads Quentes / Total</p>
                        </div>
                    </div>
                </Card>

                {/* CARD 4: COMPLIANCE GAP */}
                <Card className={`bg-card border-border border-l-4 ${criticalCount > 0 ? 'border-l-red-500' : 'border-l-slate-300 dark:border-l-slate-700'} rounded-none shadow-sm overflow-hidden relative group text-card-foreground`}>
                    <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Status Compliance</span>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/40 cursor-help hover:text-muted-foreground transition-colors" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">
                                        {tooltips.compliance}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <ShieldAlert className={`h-3.5 w-3.5 ${criticalCount > 0 ? 'text-red-500 animate-pulse' : 'text-[#00FF41]'}`} />
                        </div>
                        <div className="space-y-4">
                            <h3 className={`text-3xl font-mono font-bold ${criticalCount > 0 ? 'text-red-600' : ''}`}>
                                {criticalCount}
                            </h3>
                            <div className={`text-[10px] px-2 py-1 inline-block font-bold uppercase ${criticalCount > 0 ? 'bg-red-500/10 text-red-500' : 'bg-secondary text-muted-foreground'}`}>
                                {criticalCount > 0 ? 'Gaps Detectados' : 'Nenhuma violação'}
                            </div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-tight font-bold whitespace-nowrap">
                                Auditoria ISO 42001 Ativa
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </TooltipProvider>
    );
};
