import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Percent,
    ArrowUpRight,
    ArrowDownRight,
    Filter,
    Download,
    Building2,
    ChevronRight,
    AlertCircle,
    RefreshCw
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { api } from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';

export default function FinancialSummary() {
    const { openSlideOver } = useApp();
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    const { data: report, isLoading } = useQuery({
        queryKey: ['financial_report', month, year],
        queryFn: () => api.getFinancialReport(month, year),
    });

    const handleViewDetails = (row: any) => {
        openSlideOver('financial-detail', { record: row, month, year });
    };

    const totals = report?.reduce((acc, curr) => ({
        revenue: acc.revenue + curr.revenueFixed + curr.revenueVariable,
        costs: acc.costs + curr.costFixed + curr.costVariableLlm + curr.costVariableVoice + curr.costVariableOther,
        margin: acc.margin + curr.netMargin
    }), { revenue: 0, costs: 0, margin: 0 }) || { revenue: 0, costs: 0, margin: 0 };

    const averageMargin = report && report.length > 0
        ? (totals.margin / (totals.revenue || 1)) * 100
        : 0;

    const months = [
        { value: 1, label: 'Janeiro' },
        { value: 2, label: 'Fevereiro' },
        { value: 3, label: 'Março' },
        { value: 4, label: 'Abril' },
        { value: 5, label: 'Maio' },
        { value: 6, label: 'Junho' },
        { value: 7, label: 'Julho' },
        { value: 8, label: 'Agosto' },
        { value: 9, label: 'Setembro' },
        { value: 10, label: 'Outubro' },
        { value: 11, label: 'Novembro' },
        { value: 12, label: 'Dezembro' }
    ];

    const years = [2024, 2025, 2026];

    if (isLoading) {
        return (
            <MainLayout>
                <div className="p-6 space-y-6">
                    <Skeleton className="h-10 w-48" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                    <Skeleton className="h-[400px] w-full" />
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="h-full overflow-y-auto">
                <div className="sticky top-0 z-10 bg-background border-b border-border">
                    <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                Resumo Financeiro (DRE)
                                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Internal Only</Badge>
                            </h1>
                            <p className="text-sm text-muted-foreground">Visão consolidada de receitas e custos Davos por tenant</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map(m => (
                                        <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                                <SelectTrigger className="w-[100px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {years.map(y => (
                                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button 
                                variant="outline" 
                                className="gap-2 border-accent/20 hover:border-accent hover:bg-accent/5"
                                onClick={async () => {
                                    const loadingToast = toast.loading('Processando faturamento do mês...');
                                    try {
                                        await api.processBilling(month, year);
                                        toast.success('Métricas processadas!', { id: loadingToast, description: 'As DREs foram atualizadas com base no consumo LLM/Voz.' });
                                    } catch (err) {
                                        toast.error('Erro ao processar', { id: loadingToast });
                                    }
                                }}
                            >
                                <RefreshCw className="h-4 w-4" />
                                <span className="hidden md:inline">Processar Mês</span>
                            </Button>

                            <Button variant="outline" size="icon">
                                <Download className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="rounded-none border-l-4 border-l-success">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Receita Total</p>
                                    <ArrowUpRight className="h-4 w-4 text-success" />
                                </div>
                                <p className="text-3xl font-black">R$ {totals.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Badge variant="outline" className="h-4 py-0 px-1 font-normal opacity-70">BRUTO</Badge>
                                    <span>Inclui taxas fixas e excedentes</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-none border-l-4 border-l-destructive">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Custo Operacional Davos</p>
                                    <ArrowDownRight className="h-4 w-4 text-destructive" />
                                </div>
                                <p className="text-3xl font-black">R$ {totals.costs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Badge variant="outline" className="h-4 py-0 px-1 font-normal opacity-70">INTERNO</Badge>
                                    <span>Infra + LLM + Voz (Taxas base)</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-none border-l-4 border-l-accent">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Margem Líquida</p>
                                    <Percent className="h-4 w-4 text-accent" />
                                </div>
                                <p className="text-3xl font-black">{averageMargin.toFixed(1)}%</p>
                                <div className="mt-2 text-[10px] text-muted-foreground">
                                    <span className="font-bold text-accent">R$ {totals.margin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> acumulado no período
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* DRE Table */}
                    <Card className="rounded-none">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
                            <div>
                                <CardTitle className="text-lg">Lucratividade por Empresa</CardTitle>
                                <CardDescription>Detalhamento de performance financeira por cliente</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" className="text-xs gap-2">
                                <Filter className="h-3 w-3" />
                                Filtrar Performance
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="relative w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm">
                                    <thead className="[&_tr]:border-b bg-muted/50">
                                        <tr className="border-b transition-colors">
                                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Empresa / Plano</th>
                                            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Receita</th>
                                            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Custos Davos</th>
                                            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Margem R$</th>
                                            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground font-bold">Margem %</th>
                                            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {report?.map((row) => {
                                            const rowRevenue = row.revenueFixed + row.revenueVariable;
                                            const rowCosts = row.costFixed + row.costVariableLlm + row.costVariableVoice + row.costVariableOther;
                                            const marginPct = (row.netMargin / (rowRevenue || 1)) * 100;
                                            const isLowMargin = marginPct < 20;

                                            return (
                                                <tr key={row.tenantId} className="border-b transition-colors hover:bg-muted/30">
                                                    <td className="p-4 align-middle">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-foreground">{row.companyName}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase">{row.planName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle text-right">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">R$ {rowRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            <span className="text-[10px] text-muted-foreground italic">Fix: {row.revenueFixed.toFixed(0)} | Var: {row.revenueVariable.toFixed(0)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle text-right">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-destructive">R$ {rowCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            <span className="text-[10px] text-muted-foreground italic">Infra: {row.costFixed.toFixed(0)} | Uso: {(row.costVariableLlm + row.costVariableVoice).toFixed(0)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle text-right font-mono font-medium">
                                                        R$ {row.netMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-4 align-middle text-right">
                                                        <Badge
                                                            variant={marginPct >= 40 ? 'default' : marginPct >= 15 ? 'secondary' : 'destructive'}
                                                            className={cn(
                                                                "rounded-none h-7 px-3",
                                                                marginPct >= 40 ? "bg-success hover:bg-success/90" :
                                                                    marginPct >= 15 ? "bg-amber-100 text-amber-900 border-amber-200" : ""
                                                            )}
                                                        >
                                                            {marginPct.toFixed(1)}%
                                                        </Badge>
                                                    </td>
                                                    <td className="p-4 align-middle text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => handleViewDetails(row)}
                                                        >
                                                            <ChevronRight className="h-4 w-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {report?.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                                    <p>Nenhum dado financeiro encontrado para este período.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Business Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="rounded-none border-l-4 border-l-amber-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    ⚠️ Alertas de Baixa Margem
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {report?.filter(r => (r.netMargin / (r.revenueFixed + r.revenueVariable || 1)) < 0.2).map(r => (
                                        <div key={r.tenantId} className="flex items-center justify-between text-xs p-2 bg-amber-50 border border-amber-100 rounded-sm">
                                            <span className="font-medium text-amber-900">{r.companyName}</span>
                                            <span className="text-amber-700 font-bold">{((r.netMargin / (r.revenueFixed + r.revenueVariable || 1)) * 100).toFixed(1)}%</span>
                                        </div>
                                    ))}
                                    {report?.filter(r => (r.netMargin / (r.revenueFixed + r.revenueVariable || 1)) < 0.2).length === 0 && (
                                        <p className="text-xs text-muted-foreground italic">Todas as empresas operando com margem saudável (+20%)</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-none border-l-4 border-l-blue-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    💡 Recomendações Estratégicas
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-xs space-y-2 text-muted-foreground">
                                <p>• Avalie upgrade de plano para clientes com alto consumo variável e margem &lt; 30%.</p>
                                <p>• Clientes com custos fixos de infra altos e poucos agentes podem estar subutilizando a plataforma.</p>
                                <p>• Considere revisar as taxas de Voz (VAPI) para operações com alto volume de minutos.</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
