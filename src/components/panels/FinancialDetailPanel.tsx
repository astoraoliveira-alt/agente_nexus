import { useQuery } from '@tanstack/react-query';
import {
    TrendingUp,
    TrendingDown,
    Building2,
    Calendar,
    DollarSign,
    Scale,
    PieChart,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    CheckCircle2
} from 'lucide-react';
import { api } from '@/services/api';
import { FinancialReportRecord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface FinancialDetailPanelProps {
    data: {
        record: FinancialReportRecord;
        month: number;
        year: number;
    };
}

export function FinancialDetailPanel({ data }: FinancialDetailPanelProps) {
    const { record, month, year } = data;

    // Fetch individual Davos Costs for this company to show the fixed cost breakdown
    const { data: davosCosts, isLoading } = useQuery({
        queryKey: ['company_davos_costs', record.tenantId],
        queryFn: () => api.getDavosCosts(record.tenantId),
    });

    const monthName = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ][month - 1];

    const totalRevenue = record.revenueFixed + record.revenueVariable;
    const totalCosts = record.costFixed + record.costVariableLlm + record.costVariableVoice + record.costVariableOther;
    const marginPct = (record.netMargin / (totalRevenue || 1)) * 100;

    if (isLoading) {
        return (
            <div className="p-6 space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background p-6 space-y-8 pb-20">
            {/* Header Info */}
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-xl font-black text-foreground">{record.companyName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="rounded-none uppercase tracking-tighter text-[10px]">
                            {record.planName}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {monthName} {year}
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Resultado Líquido</p>
                    <p className={cn(
                        "text-2xl font-black",
                        record.netMargin >= 0 ? "text-success" : "text-destructive"
                    )}>
                        R$ {record.netMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* Revenue Section */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-success uppercase text-xs font-black tracking-widest">
                    <TrendingUp className="h-4 w-4" />
                    Receita (Faturamento)
                </div>
                <Card className="rounded-none border-t-0 shadow-none bg-muted/20 border-r-0 border-b-0 border-l-4 border-l-success">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-medium">Faturamento Fixo (Assinatura)</span>
                            <span className="font-bold">R$ {record.revenueFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-medium">Excedentes Variáveis (Consumo)</span>
                            <span className="font-bold">R$ {record.revenueVariable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <Separator className="bg-success/20" />
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase">Total Receita Bruta</span>
                            <span className="text-lg font-black text-success">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Costs Section */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-destructive uppercase text-xs font-black tracking-widest">
                    <TrendingDown className="h-4 w-4" />
                    Custos Operacionais Davos
                </div>

                <div className="grid gap-3">
                    {/* Fixed Costs Breakdown */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-70 flex justify-between">
                            <span>Custos Fixos de Infraestrutura</span>
                            <span>R$ {record.costFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                            {davosCosts?.filter(c => c.isRecurring).map(cost => (
                                <div key={cost.id || cost.itemKey} className="flex justify-between items-center text-[13px] p-2 bg-muted/40 border border-border/50">
                                    <span className="text-muted-foreground">{cost.itemLabel}</span>
                                    <span className="font-medium">R$ {cost.costValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            ))}
                            {davosCosts?.filter(c => c.isRecurring).length === 0 && (
                                <p className="text-[11px] italic text-muted-foreground opacity-50 text-center py-2">Nenhum custo fixo configurado.</p>
                            )}
                        </div>
                    </div>

                    {/* Variable Costs Breakdown */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-70 flex justify-between">
                            <span>Custos de Consumo Variável (IA/Voz)</span>
                            <span>R$ {(record.costVariableLlm + record.costVariableVoice + record.costVariableOther).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                            <div className="flex justify-between items-center text-[13px] p-2 bg-muted/40 border border-border/50">
                                <span className="text-muted-foreground">Tokens LLM (Infra Real)</span>
                                <span className="font-medium">R$ {record.costVariableLlm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-[13px] p-2 bg-muted/40 border border-border/50">
                                <span className="text-muted-foreground">Vapi / Minutos de Voz (Infra Real)</span>
                                <span className="font-medium">R$ {record.costVariableVoice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {record.costVariableOther > 0 && (
                                <div className="flex justify-between items-center text-[13px] p-2 bg-muted/40 border border-border/50">
                                    <span className="text-muted-foreground">Outros (Twilio/Vapi Var)</span>
                                    <span className="font-bold">R$ {record.costVariableOther.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Profitability Summary */}
            <section className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2 text-accent uppercase text-xs font-black tracking-widest">
                    <PieChart className="h-4 w-4" />
                    Análise de Margem
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/20 border border-border">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Margem Operacional</p>
                        <p className={cn(
                            "text-xl font-black",
                            marginPct >= 20 ? "text-success" : "text-destructive"
                        )}>
                            {marginPct.toFixed(1)}%
                        </p>
                    </div>
                    <div className="p-4 bg-muted/20 border border-border">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">SLA Financeiro</p>
                        <p className="text-xl font-black text-foreground flex items-center gap-2">
                            {marginPct >= 20 ? (
                                <CheckCircle2 className="h-5 w-5 text-success" />
                            ) : (
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                            )}
                            {marginPct >= 20 ? 'Saudável' : 'Abaixo do Alvo'}
                        </p>
                    </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed italic opacity-70">
                    * Os custos de consumo variável são calculados com base nas taxas internas da Davos (ex: R$ 0,05 por 1k tokens, R$ 0,15 por minuto de voz).
                </p>
            </section>
        </div>
    );
}
