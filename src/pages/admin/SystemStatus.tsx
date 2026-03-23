import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    RefreshCw, Globe, Server, Activity, ArrowRight,
    AlertCircle, CheckCircle2, Clock, Play,
    ShieldAlert, Database, Building2,
    Bug, Search, Terminal, Code2, HelpCircle, X,
    TrendingDown, Target, Filter, CalendarRange
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { api } from "@/services/api";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";

import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from '@/components/layout/MainLayout';

// ──────────────────────────────────────
// Types
// ──────────────────────────────────────
interface HealthCheck {
    service: string;
    status: 'healthy' | 'degraded' | 'down';
    latency: number;
    region: string;
    url?: string;
}

interface SystemStatusData {
    timestamp: string;
    source_region: string;
    checks: HealthCheck[];
}

/** Mirrors the `metrics` object returned by fn_get_mission_control_v2 */
interface QueueStats {
    success: number;
    critical: number;
    pending: number;
    rejected: number;
    avg_latency: number;
    // derived in component
    total_messages: number;
    error_rate: number;
}

interface RCAData {
    error_type: string;
    root_cause: string;
    occurrence_count: number;
    impact_level: string;
}

// ──────────────────────────────────────
// Period presets
// ──────────────────────────────────────
/**
 * period values match fn_get_mission_control_v2 CASE clauses.
 * 'last_month' is mapped to 'custom' with explicit dates.
 */
type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

/** Returns ISO strings for custom date build (only used for last_month & custom) */
function getCustomRange(preset: 'last_month' | 'custom', customStart?: string, customEnd?: string) {
    if (preset === 'last_month') {
        const lm = subMonths(new Date(), 1);
        return {
            startDate: startOfMonth(lm).toISOString(),
            endDate:   endOfMonth(lm).toISOString(),
        };
    }
    return {
        startDate: customStart ? new Date(customStart + 'T00:00:00').toISOString() : undefined,
        endDate:   customEnd   ? new Date(customEnd   + 'T23:59:59').toISOString() : undefined,
    };
}

// ──────────────────────────────────────
// Help content
// ──────────────────────────────────────
const HELP_ITEMS = [
    {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
        title: 'Sucesso (período)',
        description: 'Quantidade de mensagens que completaram o processamento com sucesso dentro do período selecionado. Meta: maior que Falhas Críticas.'
    },
    {
        icon: <AlertCircle className="h-4 w-4 text-rose-500" />,
        title: 'Falhas Críticas',
        description: 'Mensagens que falharam definitivamente e foram registradas na tabela de erros. Inclui erros do n8n, timeout de agentes e falhas de LLM.'
    },
    {
        icon: <Clock className="h-4 w-4 text-blue-500" />,
        title: 'Na Fila (WIP)',
        description: 'Mensagens atualmente em processamento ou aguardando. Valor alto pode indicar gargalo no n8n. Sempre mostra o estado ao vivo (ignora filtro de data).'
    },
    {
        icon: <Activity className="h-4 w-4 text-violet-500" />,
        title: 'Latência Média',
        description: 'Tempo médio de processamento por mensagem (da criação até a conclusão). Acima de 60s indica sobrecarga no workflow.'
    },
    {
        icon: <TrendingDown className="h-4 w-4 text-orange-500" />,
        title: 'Taxa de Erro',
        description: 'Percentual de falhas sobre o total (falhas ÷ (falhas + sucessos)). Meta saudável: abaixo de 5%.'
    },
    {
        icon: <Target className="h-4 w-4 text-slate-500" />,
        title: 'Total Processado',
        description: 'Volume total de mensagens processadas (sucesso + falha) no período. Útil para entender a carga da plataforma.'
    },
    {
        icon: <Bug className="h-4 w-4 text-rose-500" />,
        title: 'Causa Raiz de Falhas',
        description: 'Agrupamento das mensagens de erro por pattern. Clique no botão RAW JSON para ver todos os dados brutos registrados pelo n8n.'
    },
    {
        icon: <ShieldAlert className="h-4 w-4 text-amber-500" />,
        title: 'Fila de Recuperação',
        description: 'Mensagens travadas (stuck) há mais de 5 minutos ou com status de falha. Use o botão Retry para reprocessar individualmente.'
    },
];

// ──────────────────────────────────────
// Component
// ──────────────────────────────────────
export default function SystemStatus() {
    const [infraData, setInfraData] = useState<SystemStatusData | null>(null);
    const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
    const [rcaData, setRcaData] = useState<RCAData[]>([]);
    const [failedMessages, setFailedMessages] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<string>("all");
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [browserLatency, setBrowserLatency] = useState<{ v: number; s: number; o: number; w: number } | null>(null);

    // Period & search state
    const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('today');
    const [customStart, setCustomStart] = useState<string>('');
    const [customEnd, setCustomEnd] = useState<string>('');
    const [searchText, setSearchText] = useState<string>('');
    const [searchInput, setSearchInput] = useState<string>('');
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const checkBrowserLatency = async () => {
        const startV = performance.now();
        await fetch('/robots.txt', { method: 'HEAD', cache: 'no-store' }).catch(() => { });
        const endV = performance.now();

        const startS = performance.now();
        await supabase.from('users').select('count', { count: 'exact', head: true });
        const endS = performance.now();

        const startW = performance.now();
        await fetch('https://n8n.io', { mode: 'no-cors' }).catch(() => { });
        const endW = performance.now();

        setBrowserLatency({
            v: Math.round(endV - startV),
            s: Math.round(endS - startS),
            o: 0,
            w: Math.round(endW - startW)
        });
    };

    const fetchData = useCallback(async (
        tenantId: string = selectedTenant,
        preset: PeriodPreset = periodPreset,
        search: string = searchText,
        cStart: string = customStart,
        cEnd: string = customEnd
    ) => {
        setLoading(true);
        const tId = tenantId === "all" ? undefined : tenantId;
        const searchParam = search.trim() || undefined;

        // Resolve ISO date boundaries for ALL presets.
        // fn_get_mission_control_v2 uses dbPeriod (string) so the DB handles the window.
        // fn_get_queue_audit and fn_get_error_root_causes only accept explicit dates,
        // so we must always compute startIso/endIso here.
        let startIso: string | undefined;
        let endIso: string | undefined;
        let dbPeriod: 'today' | 'yesterday' | 'week' | 'month' | 'custom' = preset as any;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

        switch (preset) {
            case 'today':
                startIso = todayStart.toISOString();
                endIso   = now.toISOString();
                break;
            case 'yesterday': {
                const yd = new Date(todayStart);
                yd.setDate(yd.getDate() - 1);
                startIso = yd.toISOString();
                endIso   = todayStart.toISOString();
                break;
            }
            case 'week': {
                // Start of current ISO week (Monday)
                const dow = todayStart.getDay();
                const diff = (dow === 0 ? -6 : 1 - dow);
                const weekStart = new Date(todayStart);
                weekStart.setDate(weekStart.getDate() + diff);
                startIso = weekStart.toISOString();
                endIso   = now.toISOString();
                break;
            }
            case 'month': {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                startIso = monthStart.toISOString();
                endIso   = now.toISOString();
                break;
            }
            case 'last_month':
            case 'custom': {
                const r = getCustomRange(preset, cStart, cEnd);
                startIso = r.startDate;
                endIso   = r.endDate;
                dbPeriod = 'custom';
                break;
            }
        }

        try {
            checkBrowserLatency();

            const [infra, v2, rca, failed, comps] = await Promise.all([
                fetch('/api/check-latency').then(r => r.json()).catch(() => null),
                api.getMissionControlV2(tId, dbPeriod, searchParam, startIso, endIso),
                api.getErrorRootCauses(tId, startIso, endIso, searchParam),
                api.getFailedMessages(tId, startIso, endIso, searchParam),
                companies.length ? Promise.resolve(companies) : api.getCompanies()
            ]);

            setInfraData(infra);

            // Normalise v2 metrics into the QueueStats shape
            const m = v2?.metrics ?? {};
            const success  = Number(m.success  ?? 0);
            const critical = Number(m.critical ?? 0);
            const total    = success + critical;
            setQueueStats({
                success,
                critical,
                pending:          Number(m.pending     ?? 0),
                rejected:         Number(m.rejected    ?? 0),
                avg_latency:      Number(m.avg_latency ?? 0),
                total_messages:   total,
                error_rate:       total > 0 ? (critical / total) * 100 : 0,
            });

            setRcaData(rca);
            setFailedMessages(failed);
            if (!companies.length) setCompanies(comps);
        } catch (err) {
            console.error("Critical failure in status fetch:", err);
            toast.error("Erro ao sincronizar Centro de Comando");
        } finally {
            setLoading(false);
        }
    }, [selectedTenant, periodPreset, searchText, customStart, customEnd, companies]);

    // Initial load
    useEffect(() => {
        fetchData();
    }, []);

    // Debounced search
    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            setSearchText(searchInput);
            fetchData(selectedTenant, periodPreset, searchInput, customStart, customEnd);
        }, 500);

        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        };
    }, [searchInput]);

    const handlePeriodChange = (preset: PeriodPreset) => {
        setPeriodPreset(preset);
        if (preset === 'custom') return; // wait for user to click Filtrar
        fetchData(selectedTenant, preset, searchText, customStart, customEnd);
    };

    const handleCustomApply = () => {
        if (!customStart || !customEnd) {
            toast.warning("Selecione data inicial e final.");
            return;
        }
        fetchData(selectedTenant, 'custom', searchText, customStart, customEnd);
    };

    const handleTenantChange = (val: string) => {
        setSelectedTenant(val);
        fetchData(val, periodPreset, searchText, customStart, customEnd);
    };

    const handleRetry = async (queueId: string) => {
        setProcessingId(queueId);
        try {
            await api.retryFailedMessage(queueId);
            toast.success("Mensagem reenviada para a Fila V7");
            await fetchData();
        } catch (err) {
            console.error(err);
            toast.error("Falha ao reprocessar mensagem");
        } finally {
            setProcessingId(null);
        }
    };

    const clearSearch = () => {
        setSearchInput('');
        setSearchText('');
        fetchData(selectedTenant, periodPreset, '', customStart, customEnd);
    };

    const getStatusColor = (status: string, latency: number) => {
        if (status === 'down') return 'bg-destructive/10 text-destructive border-destructive/20';
        if (status === 'degraded' || latency > 500) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    };

    const getImpactColor = (level: string) => {
        const s = (level || '').toUpperCase();
        if (s === 'CRÍTICO') return 'text-destructive font-black uppercase text-[10px]';
        if (s === 'ALTO') return 'text-amber-600 font-bold uppercase text-[10px]';
        return 'text-blue-600 font-semibold uppercase text-[10px]';
    };

    const errorRateColor = (rate: number) => {
        if (rate > 20) return 'text-rose-950';
        if (rate > 5) return 'text-amber-900';
        return 'text-emerald-900';
    };

    const periodLabel = () => {
        const presets: Record<PeriodPreset, string> = {
            today: 'Hoje',
            yesterday: 'Ontem',
            week: 'Esta Semana',
            month: 'Este Mês',
            last_month: 'Mês Anterior',
            custom: `${customStart || '?'} → ${customEnd || '?'}`
        };
        return presets[periodPreset];
    };

    return (
        <MainLayout>
            <div className="flex flex-col gap-6 animate-in fade-in duration-700 max-w-[1600px] mx-auto pb-10 p-8">

                {/* ── STICKY HEADER ── */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sticky top-0 bg-background/80 backdrop-blur-md z-30 py-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
                            <Activity className="h-6 w-6 text-accent-foreground" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                                Mission Control Davos
                            </h1>
                            <div className="flex items-center gap-3 mt-1">
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] uppercase font-black">
                                    AI QUEUE V7: ATIVA
                                </Badge>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Último Check: {format(new Date(), 'HH:mm:ss')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                        {/* Tenant filter */}
                        <Select value={selectedTenant} onValueChange={handleTenantChange}>
                            <SelectTrigger className="w-[220px] bg-muted/50 font-bold text-xs ring-offset-background focus:ring-accent">
                                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Filtrar por Empresa" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Global (Davos Hub)</SelectItem>
                                {companies.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Help button */}
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="h-9 gap-1.5 font-black text-[10px] uppercase text-muted-foreground hover:text-foreground">
                                    <HelpCircle className="h-4 w-4" />
                                    Ajuda
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-wider text-sm">
                                        <HelpCircle className="h-4 w-4 text-accent" /> Guia dos Indicadores
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-muted-foreground">
                                        Entenda o que cada card e seção representa no Mission Control.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 mt-2">
                                    {HELP_ITEMS.map((item, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                            <div className="mt-0.5 shrink-0">{item.icon}</div>
                                            <div>
                                                <p className="text-xs font-black uppercase tracking-wide text-foreground">{item.title}</p>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{item.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </DialogContent>
                        </Dialog>

                        <Button onClick={() => fetchData()} variant="default" disabled={loading} className="h-9 font-black text-xs uppercase shadow-xl hover:scale-105 transition-transform">
                            {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                            Sincronizar
                        </Button>
                    </div>
                </div>

                {/* ── PERIOD FILTERS ── */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-muted-foreground mr-2">
                            <CalendarRange className="h-4 w-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Período:</span>
                        </div>
                        {(['today', 'yesterday', 'week', 'month', 'last_month', 'custom'] as PeriodPreset[]).map(preset => (
                            <Button
                                key={preset}
                                variant={periodPreset === preset ? "default" : "outline"}
                                size="sm"
                                className={cn(
                                    "h-7 px-3 text-[10px] font-black uppercase tracking-wide transition-all",
                                    periodPreset === preset ? "shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}
                                onClick={() => handlePeriodChange(preset)}
                            >
                                {preset === 'today' && 'Hoje'}
                                {preset === 'yesterday' && 'Ontem'}
                                {preset === 'week' && 'Semana'}
                                {preset === 'month' && 'Mês'}
                                {preset === 'last_month' && 'Mês Anterior'}
                                {preset === 'custom' && <><Filter className="h-3 w-3 mr-1" />Personalizado</>}
                            </Button>
                        ))}
                    </div>

                    {/* Custom date inputs */}
                    {periodPreset === 'custom' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">De:</span>
                            <Input
                                type="date"
                                value={customStart}
                                onChange={e => setCustomStart(e.target.value)}
                                className="h-8 text-xs w-40 bg-muted/30"
                            />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Até:</span>
                            <Input
                                type="date"
                                value={customEnd}
                                onChange={e => setCustomEnd(e.target.value)}
                                className="h-8 text-xs w-40 bg-muted/30"
                            />
                            <Button onClick={handleCustomApply} size="sm" className="h-8 font-black text-xs uppercase" disabled={loading}>
                                Filtrar
                            </Button>
                        </div>
                    )}

                    {/* Search bar */}
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por erro, agente ou empresa…"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            className="pl-9 pr-9 h-8 text-xs bg-muted/30 placeholder:text-muted-foreground/50 font-medium"
                        />
                        {searchInput && (
                            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Active filters badge */}
                    {(searchText || periodPreset !== 'today') && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">Filtros ativos:</span>
                            <Badge variant="secondary" className="text-[10px] font-black uppercase gap-1">
                                <CalendarRange className="h-3 w-3" /> {periodLabel()}
                            </Badge>
                            {searchText && (
                                <Badge variant="secondary" className="text-[10px] font-black uppercase gap-1">
                                    <Search className="h-3 w-3" /> "{searchText}"
                                </Badge>
                            )}
                        </div>
                    )}
                </div>

                {/* ── ROW 1: KPI CARDS ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <Card className="lg:col-span-1 border-none shadow-sm hover:shadow-md transition-shadow bg-emerald-50/30">
                        <CardHeader className="pb-2 space-y-0">
                            <div className="flex items-center justify-between">
                                <CardDescription className="text-emerald-600 font-black text-[10px] uppercase tracking-[0.2em]">Sucesso</CardDescription>
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            </div>
                            <CardTitle className="text-4xl font-black text-emerald-950">{queueStats?.success ?? '--'}</CardTitle>
                            <p className="text-[9px] text-emerald-600/70 font-bold uppercase">{periodLabel()}</p>
                        </CardHeader>
                    </Card>

                    <Card className="lg:col-span-1 border-none shadow-sm hover:shadow-md transition-shadow bg-rose-50/30">
                        <CardHeader className="pb-2 space-y-0">
                            <div className="flex items-center justify-between">
                                <CardDescription className="text-rose-600 font-black text-[10px] uppercase tracking-[0.2em]">Falhas Críticas</CardDescription>
                                <AlertCircle className="h-4 w-4 text-rose-500" />
                            </div>
                            <CardTitle className="text-4xl font-black text-rose-950">{queueStats?.critical ?? '--'}</CardTitle>
                            <p className="text-[9px] text-rose-600/70 font-bold uppercase">{periodLabel()}</p>
                        </CardHeader>
                    </Card>

                    {/* 🚫 NEW: Rejected card */}
                    <Card className="lg:col-span-1 border-none shadow-sm hover:shadow-md transition-shadow bg-amber-50/30">
                        <CardHeader className="pb-2 space-y-0">
                            <div className="flex items-center justify-between">
                                <CardDescription className="text-amber-600 font-black text-[10px] uppercase tracking-[0.2em]">Rejeitados</CardDescription>
                                <X className="h-4 w-4 text-amber-500" />
                            </div>
                            <CardTitle className="text-4xl font-black text-amber-950">{queueStats?.rejected ?? '--'}</CardTitle>
                            <p className="text-[9px] text-amber-600/70 font-bold uppercase">{periodLabel()}</p>
                        </CardHeader>
                    </Card>

                    <Card className="lg:col-span-1 border-none shadow-sm hover:shadow-md transition-shadow bg-blue-50/30">
                        <CardHeader className="pb-2 space-y-0">
                            <div className="flex items-center justify-between">
                                <CardDescription className="text-blue-600 font-black text-[10px] uppercase tracking-[0.2em]">Na Fila (WIP)</CardDescription>
                                <Clock className="h-4 w-4 text-blue-500" />
                            </div>
                            <CardTitle className="text-4xl font-black text-blue-950">{queueStats?.pending ?? '--'}</CardTitle>
                            <p className="text-[9px] text-blue-600/70 font-bold uppercase">Ao Vivo</p>
                        </CardHeader>
                    </Card>

                    <Card className="lg:col-span-1 border-none shadow-sm hover:shadow-md transition-shadow bg-violet-50/30">
                        <CardHeader className="pb-2 space-y-0">
                            <div className="flex items-center justify-between">
                                <CardDescription className="text-violet-600 font-black text-[10px] uppercase tracking-[0.2em]">Latência Média</CardDescription>
                                <Activity className="h-4 w-4 text-violet-500" />
                            </div>
                            <CardTitle className="text-4xl font-black text-violet-950">{(queueStats?.avg_latency ?? 0).toFixed(1)}s</CardTitle>
                            <p className="text-[9px] text-violet-600/70 font-bold uppercase">{periodLabel()}</p>
                        </CardHeader>
                    </Card>

                    <Card className={cn("lg:col-span-1 border-none shadow-sm hover:shadow-md transition-shadow", (queueStats?.error_rate ?? 0) > 10 ? 'bg-orange-50/50' : 'bg-slate-50/30')}>
                        <CardHeader className="pb-2 space-y-0">
                            <div className="flex items-center justify-between">
                                <CardDescription className="text-orange-600 font-black text-[10px] uppercase tracking-[0.2em]">Taxa de Erro</CardDescription>
                                <TrendingDown className="h-4 w-4 text-orange-500" />
                            </div>
                            <CardTitle className={cn("text-4xl font-black", errorRateColor(queueStats?.error_rate ?? 0))}>
                                {(queueStats?.error_rate ?? 0).toFixed(1)}%
                            </CardTitle>
                            <p className="text-[9px] text-orange-600/70 font-bold uppercase">{periodLabel()}</p>
                        </CardHeader>
                    </Card>

                    <Card className="lg:col-span-1 border-none shadow-sm hover:shadow-md transition-shadow bg-slate-50/30">
                        <CardHeader className="pb-2 space-y-0">
                            <div className="flex items-center justify-between">
                                <CardDescription className="text-slate-600 font-black text-[10px] uppercase tracking-[0.2em]">Total</CardDescription>
                                <Target className="h-4 w-4 text-slate-500" />
                            </div>
                            <CardTitle className="text-4xl font-black text-slate-950">
                                {queueStats?.total_messages ?? '--'}
                            </CardTitle>
                            <p className="text-[9px] text-slate-600/70 font-bold uppercase">{periodLabel()}</p>
                        </CardHeader>
                    </Card>
                </div>

                {/* ── TABS ── */}
                <Tabs defaultValue="ops" className="w-full">
                    <TabsList className="bg-muted/50 p-1 rounded-xl mb-6">
                        <TabsTrigger value="ops" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide">Operações AI</TabsTrigger>
                        <TabsTrigger value="infra" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide">Infraestrutura</TabsTrigger>
                    </TabsList>

                    {/* ── OPS TAB ── */}
                    <TabsContent value="ops" className="mt-0 outline-none">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* CAUSA RAIZ */}
                            <Card className="lg:col-span-1 shadow-sm border-border/50">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500"><Bug className="h-4 w-4" /></div>
                                            <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground/80">Causa Raiz de Falhas</CardTitle>
                                        </div>
                                        {rcaData.length > 0 && (
                                            <Badge variant="outline" className="text-[9px] font-black border-rose-200 text-rose-600 bg-rose-50">{rcaData.length} tipos</Badge>
                                        )}
                                    </div>
                                    <CardDescription className="text-[11px]">
                                        Erros agrupados por tipo · {periodLabel()}
                                        {searchText && <span className="text-accent font-bold"> · "{searchText}"</span>}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {rcaData.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground opacity-50">
                                            <CheckCircle2 className="h-10 w-10 mb-2" />
                                            <p className="text-[11px] font-bold">Nenhum erro no período.</p>
                                        </div>
                                    ) : (
                                        rcaData.map((rca, idx) => {
                                            let title = "FALHA NO FLUXO";
                                            let origin = "DESCONHECIDO";
                                            let workflow = "---";
                                            let nodeInfo = "";
                                            let isJsonLike = false;
                                            let parsedRaw = rca.error_type;

                                            try {
                                                const parsed = JSON.parse(rca.error_type);
                                                if (parsed && typeof parsed === 'object') {
                                                    isJsonLike = true;
                                                    title = parsed.mensagem || parsed.MENSAGEM || parsed.message || parsed.error || title;
                                                    origin = parsed.origem || parsed.ORIGEM || parsed.origin || origin;
                                                    workflow = parsed.workflow || parsed.WORKFLOW || workflow;
                                                    nodeInfo = parsed.node || parsed.NODE || "";
                                                    parsedRaw = JSON.stringify(parsed, null, 2);
                                                }
                                            } catch {
                                                if (rca.error_type && rca.error_type.trim().startsWith('{')) {
                                                    isJsonLike = true;
                                                    const msgM = rca.error_type.match(/"(?:MENSAGEM|mensagem|message|error)"\s*:\s*"([^"]+)"/i);
                                                    if (msgM) title = msgM[1];
                                                    const orgM = rca.error_type.match(/"(?:ORIGEM|origem|origin)"\s*:\s*"([^"]+)"/i);
                                                    if (orgM) origin = orgM[1];
                                                    const wfM = rca.error_type.match(/"(?:WORKFLOW|workflow)"\s*:\s*"([^"]+)"/i);
                                                    if (wfM) workflow = wfM[1];
                                                    const nodeM = rca.error_type.match(/"(?:node|NODE)"\s*:\s*"([^"]+)"/i);
                                                    if (nodeM) nodeInfo = nodeM[1];
                                                }
                                            }

                                            return (
                                                <div key={idx} className="group flex flex-col gap-2 border-b border-border/40 pb-4 last:border-0 last:pb-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex flex-col gap-1.5 overflow-hidden flex-1">
                                                            <span
                                                                className="text-xs font-black text-foreground uppercase tracking-tight line-clamp-2 leading-tight"
                                                                title={title}
                                                            >
                                                                {isJsonLike ? title : rca.error_type}
                                                            </span>
                                                            <div className="flex flex-wrap items-center gap-1">
                                                                {origin !== "DESCONHECIDO" && (
                                                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-700">{origin}</Badge>
                                                                )}
                                                                {workflow !== "---" && (
                                                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-black uppercase bg-amber-100 text-amber-700 truncate max-w-[120px]" title={workflow}>{workflow}</Badge>
                                                                )}
                                                                {nodeInfo && (
                                                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-black uppercase bg-blue-100 text-blue-700 truncate max-w-[100px]" title={nodeInfo}>{nodeInfo}</Badge>
                                                                )}
                                                                <Badge variant="outline" className="text-[9px] font-black uppercase py-0 h-4 border-rose-200 text-rose-600 bg-rose-50">ERRO</Badge>
                                                            </div>
                                                        </div>
                                                        <Badge variant="outline" className="text-[10px] bg-background font-black uppercase py-0 px-1.5 h-5 shadow-sm shrink-0">{rca.occurrence_count}x</Badge>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] font-bold uppercase text-muted-foreground/60 tracking-wider">Impacto:</span>
                                                            <span className={getImpactColor(rca.impact_level)}>{rca.impact_level}</span>
                                                        </div>

                                                        <Dialog>
                                                            <DialogTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px] font-black uppercase text-blue-600 hover:bg-blue-50 transition-all">
                                                                    <Code2 className="h-3 w-3 mr-1" />RAW JSON
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-900 shadow-2xl overflow-hidden p-0">
                                                                <DialogHeader className="px-5 py-4 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
                                                                    <DialogTitle className="text-zinc-100 font-black uppercase tracking-widest text-sm flex items-center gap-2">
                                                                        <Bug className="h-4 w-4 text-rose-500" /> Detalhes Raw da Falha
                                                                    </DialogTitle>
                                                                </DialogHeader>
                                                                <div className="bg-[#0D0D0D] p-5 overflow-auto max-h-[60vh]">
                                                                    <pre className="font-mono text-[11px] text-emerald-400 leading-relaxed whitespace-pre-wrap">{parsedRaw}</pre>
                                                                </div>
                                                            </DialogContent>
                                                        </Dialog>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </CardContent>
                            </Card>

                            {/* FILA DE RECUPERAÇÃO */}
                            <Card className="lg:col-span-2 shadow-sm border-border/50 overflow-hidden">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500"><ShieldAlert className="h-4 w-4" /></div>
                                            <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground/80">Fila de Recuperação V7</CardTitle>
                                        </div>
                                        <CardDescription className="text-[11px]">
                                            Itens com falha ou travados · {periodLabel()}
                                            {searchText && <span className="text-accent font-bold"> · "{searchText}"</span>}
                                        </CardDescription>
                                    </div>
                                    <Badge variant="secondary" className="font-black text-[10px] bg-muted/60 tracking-wider uppercase">{failedMessages.length} Itens</Badge>
                                </CardHeader>
                                <CardContent className="p-0 border-t">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-muted/30">
                                                <TableRow className="hover:bg-transparent border-border/40">
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-3">Hora</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-3">Empresa / Agente</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-3">Canal</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-3">Erro</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-3 text-right">Ação</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {failedMessages.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="h-48 text-center">
                                                            <div className="flex flex-col items-center justify-center text-muted-foreground opacity-30">
                                                                <Activity className="h-10 w-10 mb-2 animate-pulse" />
                                                                <p className="text-[11px] font-bold uppercase tracking-widest">
                                                                    {searchText ? 'Nenhum resultado para a busca.' : 'Tudo limpo! Nenhuma mensagem travada.'}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    failedMessages.map((msg, index) => {
                                                        let errorSummary = msg.out_error_message || '';
                                                        try {
                                                            const parsed = JSON.parse(errorSummary);
                                                            errorSummary = parsed.mensagem || parsed.message || parsed.error || errorSummary;
                                                        } catch { /* not JSON */ }

                                                        return (
                                                            <TableRow key={`${msg.out_id}-${msg.out_status}-${index}`} className="group hover:bg-muted/20 border-border/40 transition-colors">
                                                                <TableCell className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                                                                    {format(new Date(msg.out_created_at), 'dd/MM HH:mm', { locale: ptBR })}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-xs font-black text-foreground uppercase">{msg.out_tenant_name || 'N/A'}</span>
                                                                        <span className="text-[10px] text-muted-foreground italic">{msg.out_agent_name || 'Agente Desconhecido'}</span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant="outline" className="text-[9px] font-black uppercase border-border/50 py-0">{msg.out_message_type || 'API'}</Badge>
                                                                </TableCell>
                                                                <TableCell className="max-w-[260px]">
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="flex items-center gap-1.5">
                                                                            {msg.out_status === 'failed' ? (
                                                                                <Badge variant="destructive" className="h-[14px] text-[8px] font-black uppercase px-1 rounded-sm">Falha</Badge>
                                                                            ) : msg.out_status === 'processing' ? (
                                                                                <Badge className="h-[14px] text-[8px] font-black uppercase px-1 rounded-sm bg-amber-500">Travada</Badge>
                                                                            ) : (
                                                                                <Badge className="h-[14px] text-[8px] font-black uppercase px-1 rounded-sm bg-blue-500">Limbo</Badge>
                                                                            )}
                                                                            <span
                                                                                className="text-[10px] text-foreground font-black uppercase tracking-tighter truncate"
                                                                                title={errorSummary || 'Fila excedeu o tempo de resposta'}
                                                                            >
                                                                                {errorSummary || (msg.out_status === 'processing' ? 'TRAVADA NO N8N' : 'PARADA NA FILA')}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] text-muted-foreground/60 uppercase font-bold">Tentativas: {msg.out_retry_count || 0}</span>
                                                                            {msg.out_error_message && (
                                                                                <Dialog>
                                                                                    <DialogTrigger asChild>
                                                                                        <Button variant="ghost" size="sm" className="h-4 px-1.5 text-[8px] font-black uppercase text-blue-600 hover:bg-blue-50">
                                                                                            <Terminal className="h-2.5 w-2.5 mr-0.5" />ver raw
                                                                                        </Button>
                                                                                    </DialogTrigger>
                                                                                    <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-900 p-0">
                                                                                        <DialogHeader className="px-5 py-4 border-b border-zinc-900">
                                                                                            <DialogTitle className="text-zinc-100 font-black uppercase text-sm flex items-center gap-2">
                                                                                                <Terminal className="h-4 w-4 text-emerald-400" /> Log Completo do Erro
                                                                                            </DialogTitle>
                                                                                        </DialogHeader>
                                                                                        <div className="bg-[#0D0D0D] p-5 overflow-auto max-h-[60vh]">
                                                                                            <pre className="font-mono text-[11px] text-emerald-400 leading-relaxed whitespace-pre-wrap">
                                                                                                {(() => {
                                                                                                    try { return JSON.stringify(JSON.parse(msg.out_error_message), null, 2); }
                                                                                                    catch { return msg.out_error_message; }
                                                                                                })()}
                                                                                            </pre>
                                                                                        </div>
                                                                                    </DialogContent>
                                                                                </Dialog>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleRetry(msg.out_id)}
                                                                        disabled={processingId === msg.out_id}
                                                                        className="h-8 px-3 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 group-hover:bg-emerald-500 group-hover:text-white transition-all font-black text-[10px] uppercase gap-1.5 rounded-lg"
                                                                    >
                                                                        {processingId === msg.out_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                                                        Retry
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ── INFRA TAB ── */}
                    <TabsContent value="infra" className="mt-0 outline-none">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* BROWSER LATENCY */}
                            <Card className="shadow-sm border-border/50 px-6 py-6 h-full flex flex-col justify-center">
                                <CardHeader className="p-0 mb-6">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500"><Globe className="h-4 w-4" /></div>
                                        <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground/80">Pulso do Navegador</CardTitle>
                                    </div>
                                    <CardDescription className="text-[11px]">Latência real entre seu dispositivo e os provedores Davos.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { label: 'Vercel Edge', value: browserLatency?.v, threshold: 100 },
                                            { label: 'Supabase (DB)', value: browserLatency?.s, threshold: 300 },
                                            { label: 'OpenAI API', value: null, threshold: 0, disabled: true },
                                            { label: 'Webhooks (n8n)', value: browserLatency?.w, threshold: 500 },
                                        ].map((item, i) => (
                                            <div key={i} className="p-4 rounded-xl border border-border/40 bg-muted/20 flex flex-col gap-2 group hover:bg-muted/40 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{item.label}</span>
                                                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-3xl font-black text-slate-800">{item.disabled ? '--' : (item.value || '--')}</span>
                                                    <span className="text-[10px] font-black text-muted-foreground">ms</span>
                                                    {item.disabled ? (
                                                        <Badge className="bg-muted text-muted-foreground border-border/50 ml-auto text-[9px] px-1.5 font-bold uppercase">DESATIVADO</Badge>
                                                    ) : (
                                                        <Badge className={getStatusColor('healthy', item.value || 0) + " ml-auto text-[9px] px-1.5"}>
                                                            {(item.value || 0) < item.threshold ? 'ÓTIMO' : 'NOMINAL'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* CORE SERVICES */}
                            <Card className="shadow-sm border-border/50 overflow-hidden">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500"><Server className="h-4 w-4" /></div>
                                        <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground/80">Infraestrutura Central</CardTitle>
                                    </div>
                                    <CardDescription className="text-[11px]">Status reportado pelos servidores Davos (USA - East 1).</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0 border-t">
                                    <div className="space-y-0">
                                        {loading || !infraData ? (
                                            <div className="flex items-center justify-center py-20 animate-pulse text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                                                <Activity className="h-4 w-4 mr-2" /> Analisando Malha de Rede...
                                            </div>
                                        ) : (
                                            infraData.checks.map((check, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-4 border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground">
                                                            <Database className="h-4 w-4" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-black uppercase text-foreground">{check.service}</p>
                                                            <p className="text-[10px] text-muted-foreground lowercase opacity-70">{check.region}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <p className="text-xs font-black text-foreground">{Math.round(check.latency)}ms</p>
                                                            <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-tighter">LATÊNCIA SVR</p>
                                                        </div>
                                                        <Badge variant="outline" className={cn("text-[9px] font-black uppercase py-0 px-2", getStatusColor(check.status, check.latency))}>
                                                            {check.status === 'healthy' ? 'ATIVO' : check.status.toUpperCase()}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </MainLayout>
    );
}
