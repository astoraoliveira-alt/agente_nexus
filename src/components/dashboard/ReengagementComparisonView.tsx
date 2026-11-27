import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  RotateCcw,
  TrendingUp,
  MessageSquare,
  Layers,
  RefreshCw,
  Clock,
  Flame,
  Sun,
  Sunset,
  Moon,
  ExternalLink,
  CheckCircle2,
  PieChart,
  ArrowRight,
  Search,
  Sparkles,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import {
  Campaign,
  ReengagementComparisonData,
  ReheatingAndReengagementAnalytics,
} from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReengagementComparisonViewProps {
  initialCampaignId?: string;
  onSelectCampaign?: (campaignId: string) => void;
}

type Granularity = 'day' | 'week' | 'month';
type LeadFilter = 'all' | 'recovered' | 'no_reply';

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatPct = (value: number) =>
  `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;

const formatDateTimeBR = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
};

const getSlotMeta = (slotName: string) => {
  if (slotName.startsWith('Manhã')) {
    return {
      short: 'Manhã',
      range: '08h às 12h',
      Icon: Sun,
      accent: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
      bar: 'bg-amber-500',
    };
  }
  if (slotName.startsWith('Tarde')) {
    return {
      short: 'Tarde',
      range: '12h às 18h',
      Icon: Sunset,
      accent: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
      bar: 'bg-emerald-500',
    };
  }
  return {
    short: 'Noite',
    range: '18h às 22h',
    Icon: Moon,
    accent: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
    bar: 'bg-blue-500',
  };
};

const getPostStatusBadge = (
  status: ReheatingAndReengagementAnalytics['preapproved_leads'][number]['post_status']
) => {
  switch (status) {
    case 'Formalizado':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
    case 'Em Atendimento':
      return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
    case 'Simulou':
      return 'bg-teal-500/15 text-teal-700 border-teal-500/30';
    case 'Respondeu':
      return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

const TWO_HOUR_BUCKETS = [
  { start: 8, end: 10, label: '08h–10h' },
  { start: 10, end: 12, label: '10h–12h' },
  { start: 12, end: 14, label: '12h–14h' },
  { start: 14, end: 16, label: '14h–16h' },
  { start: 16, end: 18, label: '16h–18h' },
  { start: 18, end: 20, label: '18h–20h' },
  { start: 20, end: 22, label: '20h–22h' },
];

export function ReengagementComparisonView({
  initialCampaignId,
  onSelectCampaign,
}: ReengagementComparisonViewProps) {
  const { currentTenant } = useApp();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(() => {
    return initialCampaignId || 'all';
  });
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [analytics, setAnalytics] = useState<ReheatingAndReengagementAnalytics | null>(null);
  const [comparison, setComparison] = useState<ReengagementComparisonData | null>(null);
  const [loading, setLoading] = useState(false);

  // Drill-down filters for pre-approved reheated leads
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('all');
  const [leadSearch, setLeadSearch] = useState('');

  useEffect(() => {
    if (currentTenant) {
      loadCampaigns();
    }
  }, [currentTenant]);

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

  useEffect(() => {
    if (currentTenant) {
      loadData(selectedCampaignId, granularity);
    }
  }, [currentTenant, selectedCampaignId, granularity]);

  const loadCampaigns = async () => {
    if (!currentTenant) return;
    try {
      const data = await api.getCampaigns(currentTenant.id, false);
      setCampaigns(data || []);
    } catch (err) {
      console.error('Erro ao carregar campanhas para comparativo:', err);
    }
  };

  const loadData = async (campId: string, gran: Granularity) => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const isAll = !campId || campId === 'all';
      const [analyticsRes, comparisonRes] = await Promise.all([
        api.getReheatingAndReengagementAnalytics(
          currentTenant.id,
          isAll ? null : campId,
          gran
        ),
        isAll
          ? Promise.resolve(null)
          : api.getReengagementComparisonMetrics(currentTenant.id, campId),
      ]);
      setAnalytics(analyticsRes);
      setComparison(comparisonRes);
    } catch (err) {
      console.error('Erro ao carregar indicadores de reengajamento e reaquecimento:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCampaignChange = (val: string) => {
    setSelectedCampaignId(val);
    if (val !== 'all') {
      sessionStorage.setItem('davos_active_campaign_id', val);
      if (onSelectCampaign) onSelectCampaign(val);
    }
  };

  const reengSummary = analytics?.reengagement;
  const reheatSummary = analytics?.preapproved_reheating;
  const timeOfDay = analytics?.time_of_day;
  const timeline = analytics?.timeline || [];
  const preapprovedLeads = analytics?.preapproved_leads || [];

  // Best slot (for badge highlight only — no prescriptive insight banner)
  const bestSlotName = useMemo(() => {
    const slots = (timeOfDay?.slots || []).filter((s) => s.sent >= 10);
    if (slots.length === 0) return null;
    const sorted = [...slots].sort((a, b) => b.reply_rate - a.reply_rate);
    return sorted[0]?.slot || null;
  }, [timeOfDay]);

  const maxSlotRate = useMemo(() => {
    const rates = (timeOfDay?.slots || []).map((s) => s.reply_rate || 0);
    return Math.max(...rates, 1);
  }, [timeOfDay]);

  // Group hourly performance into clean 2-hour windows (08h–10h ... 20h–22h)
  const twoHourStats = useMemo(() => {
    const rawHours = timeOfDay?.by_hour || [];
    return TWO_HOUR_BUCKETS.map((b) => {
      const matching = rawHours.filter((h) => h.hour >= b.start && h.hour < b.end);
      const sent = matching.reduce((acc, h) => acc + (h.sent || 0), 0);
      const replied = matching.reduce((acc, h) => acc + (h.replied || 0), 0);
      const reply_rate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
      return {
        label: b.label,
        sent,
        replied,
        reply_rate,
      };
    });
  }, [timeOfDay]);

  const bestTwoHourBucket = useMemo(() => {
    const eligible = twoHourStats.filter((b) => b.sent >= 10);
    if (eligible.length === 0) return null;
    return [...eligible].sort((a, b) => b.reply_rate - a.reply_rate)[0];
  }, [twoHourStats]);

  const maxTwoHourRate = useMemo(() => {
    const rates = twoHourStats.map((b) => b.reply_rate || 0);
    return Math.max(...rates, 1);
  }, [twoHourStats]);

  // Filtered pre-approved leads
  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    return preapprovedLeads.filter((lead) => {
      if (leadFilter === 'recovered' && lead.post_status === 'Sem resposta') return false;
      if (leadFilter === 'no_reply' && lead.post_status !== 'Sem resposta') return false;
      if (q) {
        const hay = `${lead.name || ''} ${lead.cnpj || ''} ${lead.whatsapp || ''} ${lead.campaign_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [preapprovedLeads, leadFilter, leadSearch]);

  const recoveredLeadsCount = useMemo(
    () => preapprovedLeads.filter((l) => l.post_status !== 'Sem resposta').length,
    [preapprovedLeads]
  );

  const openLeadConversation = (lead: ReheatingAndReengagementAnalytics['preapproved_leads'][number]) => {
    if (lead.conversation_id) {
      navigate(`/conversations?conversationId=${encodeURIComponent(lead.conversation_id)}`);
    } else if (lead.whatsapp) {
      navigate(`/conversations?phone=${encodeURIComponent(lead.whatsapp)}`);
    } else {
      navigate('/conversations');
    }
  };

  // Existing per-campaign funnel matrix data (preserved when a specific campaign is selected)
  const orig = comparison?.original;
  const reeng = comparison?.reengagement;

  const origFunnel = comparison?.originalFunnel || {
    carregados: orig?.totalSent || 0,
    enviados: orig?.totalSent || 0,
    entregues: orig?.delivered || 0,
    lidas: orig?.read || 0,
    interagiram: orig?.replied || 0,
    confirmaram: 0,
    faturamento: 0,
    valorInicial: 0,
    optIn: orig?.optIn || 0,
    emAnalise: (orig as any)?.emAnalise || 0,
    aprovados: orig?.conversions || 0,
    recusados: 0,
    simularam: 0,
    okAgente: 0,
    aguarContato: 0,
    emAtendimento: 0,
    formalizado: 0,
    desistencia: 0,
  };

  const reengFunnel = comparison?.reengagementFunnel || {
    carregados: reeng?.totalSent || 0,
    enviados: reeng?.totalSent || 0,
    entregues: reeng?.delivered || 0,
    lidas: reeng?.read || 0,
    interagiram: reeng?.replied || 0,
    confirmaram: 0,
    faturamento: 0,
    valorInicial: 0,
    optIn: reeng?.optIn || 0,
    emAnalise: (reeng as any)?.emAnalise || 0,
    aprovados: reeng?.conversions || 0,
    recusados: 0,
    simularam: 0,
    okAgente: 0,
    aguarContato: 0,
    emAtendimento: 0,
    formalizado: 0,
    desistencia: 0,
  };

  const totalConsolidado = {
    carregados: origFunnel.carregados,
    enviados: origFunnel.enviados + reengFunnel.enviados,
    entregues: origFunnel.entregues + reengFunnel.entregues,
    lidas: origFunnel.lidas + reengFunnel.lidas,
    interagiram: origFunnel.interagiram + reengFunnel.interagiram,
    confirmaram: origFunnel.confirmaram + reengFunnel.confirmaram,
    faturamento: origFunnel.faturamento + reengFunnel.faturamento,
    valorInicial: origFunnel.valorInicial + reengFunnel.valorInicial,
    optIn: origFunnel.optIn + reengFunnel.optIn,
    emAnalise: origFunnel.emAnalise + reengFunnel.emAnalise,
    aprovados: origFunnel.aprovados + reengFunnel.aprovados,
    recusados: origFunnel.recusados + reengFunnel.recusados,
    simularam: origFunnel.simularam + reengFunnel.simularam,
    okAgente: origFunnel.okAgente + reengFunnel.okAgente,
    aguarContato: origFunnel.aguarContato + reengFunnel.aguarContato,
    emAtendimento: origFunnel.emAtendimento + reengFunnel.emAtendimento,
    formalizado: origFunnel.formalizado + reengFunnel.formalizado,
    desistencia: origFunnel.desistencia + reengFunnel.desistencia,
  };

  // KPI calculations
  const totalRecoveredReplies =
    (reengSummary?.reeng_replied || 0) + (reheatSummary?.replied || 0);
  const totalAfterReplies = (reengSummary?.orig_replied || 0) + totalRecoveredReplies;
  const reactivationSharePct =
    totalAfterReplies > 0
      ? Math.round((totalRecoveredReplies / totalAfterReplies) * 1000) / 10
      : 0;
  const totalAdvancedPostReheat =
    (reheatSummary?.simulated || 0) +
    (reheatSummary?.handoff || 0) +
    (reheatSummary?.formalized || 0);

  return (
    <div className="space-y-6">
      {/* Top Bar: Título + Filtro de Campanha + Agrupamento (Dia / Semana / Mês) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card/60 backdrop-blur-sm p-4 rounded-xl border border-border/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              Reengajamento & Reaquecimento de Pré-Aprovados
            </h2>
            <p className="text-xs text-muted-foreground">
              Impacto real antes e depois das reativações, recuperação de pré-aprovados e performance por horário
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Seletor de Campanha */}
          <div className="w-full sm:w-64">
            <Select value={selectedCampaignId} onValueChange={handleCampaignChange}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione uma campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-semibold">
                  Todas as Campanhas (Consolidado)
                </SelectItem>
                {campaigns.map((camp) => (
                  <SelectItem key={camp.id} value={camp.id} className="text-xs">
                    {camp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Segmented Switcher: Dia | Semana | Mês */}
          <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5">
            {(
              [
                { value: 'day', label: 'Dia' },
                { value: 'week', label: 'Semana' },
                { value: 'month', label: 'Mês' },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setGranularity(item.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  granularity === item.value
                    ? 'bg-background text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(selectedCampaignId, granularity)}
            disabled={loading}
            className="h-9 px-3 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
          Carregando indicadores de reengajamento e reaquecimento...
        </div>
      ) : !analytics ? (
        <Card className="border-border/60">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhum dado disponível para o filtro selecionado.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 4 Hero KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Ganho do Reengajamento (Antes -> Depois) */}
            <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-50/40 via-card to-card shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Ganho do Reengajamento
                  </span>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold tracking-tight text-emerald-600">
                    +{(reengSummary?.reeng_replied || 0).toLocaleString('pt-BR')}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-700 bg-emerald-500/10 text-[10px] py-0 px-1.5 font-semibold"
                  >
                    +{formatPct(reengSummary?.uplift_pct || 0)} de ganho
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Antes: {(reengSummary?.orig_replied || 0).toLocaleString('pt-BR')}</span>
                  <ArrowRight className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-foreground">
                    Depois: {totalAfterReplies.toLocaleString('pt-BR')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* KPI 2: Pré-Aprovados Reaquecidos */}
            <Card className="border-amber-500/25 bg-gradient-to-br from-amber-50/40 via-card to-card shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Pré-Aprovados Reaquecidos
                  </span>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                    <Flame className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold tracking-tight text-foreground">
                    {(reheatSummary?.reheated || 0).toLocaleString('pt-BR')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    de {(reheatSummary?.total_preapproved || 0).toLocaleString('pt-BR')} pré-aprovados
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-700 bg-emerald-500/10 text-[10px] py-0 px-1.5 font-semibold"
                  >
                    {(reheatSummary?.replied || 0).toLocaleString('pt-BR')} retomaram ({formatPct(reheatSummary?.reply_rate || 0)})
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* KPI 3: Avanço Pós-Reaquecimento */}
            <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Avanço Pós-Reaquecimento
                  </span>
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-blue-600">
                    +{totalAdvancedPostReheat.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-xs text-muted-foreground">ações de avanço</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                  <span>Simularam: <strong className="text-foreground">{reheatSummary?.simulated || 0}</strong></span>
                  <span>Atend.: <strong className="text-foreground">{reheatSummary?.handoff || 0}</strong></span>
                  <span>Formaliz.: <strong className="text-emerald-700">{reheatSummary?.formalized || 0}</strong></span>
                </div>
              </CardContent>
            </Card>

            {/* KPI 4: Participação nas Respostas (Peso real da reativação no total) */}
            <Card className="border-teal-500/25 bg-gradient-to-br from-teal-50/40 via-card to-card shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Participação nas Respostas
                  </span>
                  <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600">
                    <PieChart className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold tracking-tight text-teal-700">
                    {formatPct(reactivationSharePct)}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-teal-500/30 text-teal-700 bg-teal-500/10 text-[10px] py-0 px-1.5 font-semibold"
                  >
                    +{totalRecoveredReplies.toLocaleString('pt-BR')} recuperados
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Das respostas totais vieram via reengajamento e reaquecimento
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Performance por Período e Faixa de Horário (2 em 2 horas, BRT) */}
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="py-4 bg-muted/20 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    Performance por Período e Faixa de Horário
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Taxa de resposta dos disparos de reengajamento e reaquecimento por turno e faixa de 2 horas (Horário de Brasília)
                  </CardDescription>
                </div>
                {bestTwoHourBucket && (
                  <Badge
                    variant="outline"
                    className="w-fit border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-xs px-2.5 py-1 font-semibold gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Faixa pico: {bestTwoHourBucket.label} ({formatPct(bestTwoHourBucket.reply_rate)})
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-6">
              {/* Comparativo Manhã vs Tarde vs Noite */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(timeOfDay?.slots || []).map((slot) => {
                  const meta = getSlotMeta(slot.slot);
                  const Icon = meta.Icon;
                  const isBest = bestSlotName === slot.slot && slot.sent > 0;
                  const barWidth = Math.max(
                    slot.sent > 0 ? Math.round((slot.reply_rate / maxSlotRate) * 100) : 0,
                    slot.replied > 0 ? 6 : 0
                  );

                  return (
                    <div
                      key={slot.slot}
                      className={`rounded-xl border p-4 transition-all ${
                        isBest
                          ? 'border-emerald-500/40 bg-emerald-50/30 shadow-sm'
                          : 'border-border/60 bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg border ${meta.accent}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground">{meta.short}</div>
                            <div className="text-[11px] text-muted-foreground">{meta.range}</div>
                          </div>
                        </div>
                        {isBest && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                            Maior taxa
                          </Badge>
                        )}
                      </div>

                      <div className="mt-4 flex items-baseline justify-between">
                        <span className="text-2xl font-bold text-foreground">
                          {formatPct(slot.reply_rate)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <strong className="text-foreground">{slot.replied.toLocaleString('pt-BR')}</strong> / {slot.sent.toLocaleString('pt-BR')} envios
                        </span>
                      </div>

                      <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isBest ? 'bg-emerald-500' : meta.bar}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      {(slot.reheat_sent > 0 || slot.reeng_sent > 0) && (
                        <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Reeng.: {slot.reeng_replied}/{slot.reeng_sent}</span>
                          <span>Pré-Aprov.: {slot.reheat_replied}/{slot.reheat_sent}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Taxa de Resposta por Faixa de 2 em 2 Horas (7 colunas fixas sem quebra) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Taxa de Resposta por Horário de Disparo (Faixas de 2h)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Horário de Brasília (BRT)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {twoHourStats.map((b) => {
                    const isPeak = bestTwoHourBucket?.label === b.label && b.sent >= 10;
                    const heightPct = Math.max(
                      b.sent > 0 ? Math.round((b.reply_rate / maxTwoHourRate) * 100) : 0,
                      b.replied > 0 ? 12 : 4
                    );
                    return (
                      <div
                        key={b.label}
                        title={`${b.label}: ${b.replied} respostas de ${b.sent} envios (${formatPct(b.reply_rate)})`}
                        className={`flex flex-col items-center p-3 rounded-xl border text-center transition-colors ${
                          isPeak
                            ? 'border-emerald-500/50 bg-emerald-50/70 shadow-sm'
                            : b.sent === 0
                              ? 'border-border/40 bg-muted/10 opacity-60'
                              : 'border-border/60 bg-muted/20 hover:bg-muted/35'
                        }`}
                      >
                        <span className={`text-xs font-bold ${isPeak ? 'text-emerald-700' : 'text-foreground'}`}>
                          {b.sent > 0 ? formatPct(b.reply_rate) : '—'}
                        </span>
                        <div className="w-full h-12 flex items-end justify-center my-1.5">
                          <div
                            className={`w-6 rounded-t-md transition-all ${
                              b.sent === 0
                                ? 'bg-slate-200'
                                : isPeak
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-500/75'
                            }`}
                            style={{ height: `${b.sent === 0 ? 4 : heightPct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                          {b.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 whitespace-nowrap">
                          {b.replied.toLocaleString('pt-BR')} / {b.sent.toLocaleString('pt-BR')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Evolução Comparativa: Envio Original vs Reengajamento + Reaquecimento */}
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="py-4 bg-muted/20 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    Evolução Comparativa ({granularity === 'day' ? 'Por Dia' : granularity === 'week' ? 'Por Semana' : 'Por Mês'})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comparação direta entre o Envio Original das campanhas e o resultado consolidado de Reengajamento + Reaquecimento
                  </CardDescription>
                </div>

                {/* Legenda limpa */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                    <span className="text-muted-foreground font-medium">Envio Original</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
                    <span className="text-muted-foreground font-medium">Reengajamento + Reaquecimento</span>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-6">
              {timeline.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Nenhum disparo registrado neste recorte.
                </div>
              ) : (
                <>
                  {/* Gráfico Comparativo de Respostas (Recharts) */}
                  <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={timeline}
                        margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                        barGap={4}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="period_label"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          width={44}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0]?.payload as ReheatingAndReengagementAnalytics['timeline'][number];
                            if (!row) return null;
                            return (
                              <div className="rounded-xl border border-border bg-background/95 backdrop-blur-sm p-3 shadow-lg text-xs space-y-2 min-w-[230px]">
                                <div className="font-bold text-foreground border-b border-border/60 pb-1.5">
                                  {label}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                                      Envio Original
                                    </span>
                                    <span className="font-bold text-foreground">
                                      {row.orig_replied.toLocaleString('pt-BR')} resp. ({formatPct(row.orig_reply_rate)})
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground pl-4">
                                    {row.orig_sent.toLocaleString('pt-BR')} envios originais
                                  </div>
                                </div>
                                <div className="space-y-1 pt-1 border-t border-border/40">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                                      Reeng. + Reaquec.
                                    </span>
                                    <span className="font-bold text-emerald-600">
                                      +{row.react_replied.toLocaleString('pt-BR')} resp. ({formatPct(row.react_reply_rate)})
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground pl-4">
                                    {row.react_sent.toLocaleString('pt-BR')} envios ({row.reeng_sent.toLocaleString('pt-BR')} reeng. + {row.reheat_sent.toLocaleString('pt-BR')} pré-aprov.)
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="orig_replied"
                          name="Envio Original"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />
                        <Bar
                          dataKey="react_replied"
                          name="Reengajamento + Reaquecimento"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Tabela Limpa e Legível — Apenas 2 Blocos (Envio Original vs Reengajamento + Reaquecimento) */}
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th
                            rowSpan={2}
                            className="px-4 py-2.5 font-bold text-foreground bg-muted/30 border-r border-border/50"
                          >
                            Período
                          </th>
                          <th
                            colSpan={3}
                            className="px-4 py-2 text-center font-bold uppercase tracking-wider text-[10px] text-blue-900 bg-blue-50/70 border-r border-blue-100"
                          >
                            Envio Original das Campanhas
                          </th>
                          <th
                            colSpan={3}
                            className="px-4 py-2 text-center font-bold uppercase tracking-wider text-[10px] text-emerald-900 bg-emerald-50/70"
                          >
                            Reengajamento + Reaquecimento
                          </th>
                        </tr>
                        <tr className="border-b border-border/60 bg-slate-50/80 text-[10px] font-semibold uppercase text-muted-foreground">
                          <th className="px-4 py-2 text-right">Enviados</th>
                          <th className="px-4 py-2 text-right">Respostas</th>
                          <th className="px-4 py-2 text-right border-r border-border/50">Taxa</th>
                          <th className="px-4 py-2 text-right">Enviados</th>
                          <th className="px-4 py-2 text-right">Respostas</th>
                          <th className="px-4 py-2 text-right">Taxa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {[...timeline].reverse().map((row) => (
                          <tr key={row.period_label} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 font-semibold text-foreground border-r border-border/40 whitespace-nowrap">
                              {row.period_label}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                              {row.orig_sent.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-700">
                              {row.orig_replied.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-foreground border-r border-border/40">
                              {formatPct(row.orig_reply_rate)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                              {row.react_sent.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                              {row.react_replied > 0 ? `+${row.react_replied.toLocaleString('pt-BR')}` : '0'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-foreground">
                              {formatPct(row.react_reply_rate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Drill-Down: Pré-Aprovados Reaquecidos (quem parou de responder -> o que aconteceu depois) */}
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="py-4 bg-muted/20 border-b border-border/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-600" />
                    Pré-Aprovados Reaquecidos — Acompanhamento Individual
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Lista dos clientes com crédito pré-aprovado que pararam de responder e receberam reaquecimento
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Filter pills */}
                  <div className="inline-flex items-center rounded-lg border border-border/70 bg-background p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setLeadFilter('all')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        leadFilter === 'all'
                          ? 'bg-foreground text-background font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Todos ({preapprovedLeads.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeadFilter('recovered')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        leadFilter === 'recovered'
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Recuperados ({recoveredLeadsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeadFilter('no_reply')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        leadFilter === 'no_reply'
                          ? 'bg-slate-700 text-white font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Sem resposta ({preapprovedLeads.length - recoveredLeadsCount})
                    </button>
                  </div>

                  {/* Quick search */}
                  <div className="relative w-full sm:w-52">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Buscar empresa ou CNPJ..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredLeads.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {preapprovedLeads.length === 0
                    ? 'Nenhum cliente pré-aprovado foi reaquecido neste filtro ainda.'
                    : 'Nenhum cliente encontrado para o filtro aplicado.'}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-border/60 text-[10px] font-bold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Empresa / CNPJ</th>
                        {selectedCampaignId === 'all' && <th className="px-3 py-2.5">Campanha</th>}
                        <th className="px-3 py-2.5 text-right">Limite Pré-Aprovado</th>
                        <th className="px-3 py-2.5">Reaquecido em</th>
                        <th className="px-3 py-2.5">Resultado Pós-Reaquecimento</th>
                        <th className="px-4 py-2.5 text-right">Conversa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredLeads.map((lead) => (
                        <tr key={lead.lead_id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-foreground truncate max-w-[240px]">
                              {lead.name || 'Cliente sem nome'}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {lead.cnpj || lead.whatsapp || '—'}
                            </div>
                          </td>
                          {selectedCampaignId === 'all' && (
                            <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[180px]">
                              {lead.campaign_name || '—'}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                            {lead.approved_amount > 0 ? formatBRL(lead.approved_amount) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                            {formatDateTimeBR(lead.reheat_sent_at)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col items-start gap-0.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-2 py-0.5 font-semibold ${getPostStatusBadge(lead.post_status)}`}
                              >
                                {lead.post_status}
                              </Badge>
                              {lead.replied_at && (
                                <span className="text-[10px] text-muted-foreground">
                                  Respondeu em {formatDateTimeBR(lead.replied_at)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openLeadConversation(lead)}
                              className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1"
                            >
                              <span>Abrir</span>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matriz Comparativa do Funil e Lotes — Exibidos quando uma campanha específica é selecionada */}
          {selectedCampaignId !== 'all' && comparison ? (
            <>
              <div className="bg-white border border-border/60 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-muted/20 border-b border-border/40 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      Matriz Comparativa do Funil: Envio Original vs Reengajamento
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Estrutura idêntica ao Funil Executivo de Crédito com todas as etapas de Envio, Venda e Formalização
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th colSpan={2} className="px-4 py-3 bg-slate-100/70 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-r border-slate-200">
                          Identificação do Disparo
                        </th>
                        <th colSpan={5} className="px-4 py-3 bg-blue-50/80 text-blue-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-blue-100">
                          Envio da Campanha
                        </th>
                        <th colSpan={8} className="px-4 py-3 bg-emerald-50/80 text-emerald-900 font-bold uppercase tracking-wider text-[11px] text-center border-r border-emerald-100">
                          Funil de Venda
                        </th>
                        <th colSpan={4} className="px-4 py-3 bg-teal-50/80 text-teal-900 font-bold uppercase tracking-wider text-[11px] text-center">
                          Funil de Formalização
                        </th>
                      </tr>

                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="px-4 py-2.5">Origem / Etapa</th>
                        <th className="px-2 py-2.5 text-center border-r border-slate-200">Tipo</th>

                        <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Carregados</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Enviados</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Entregues</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950">Lidas</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-blue-950 border-r border-blue-100">Interagiram</th>

                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Confirmaram</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Faturamento</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Valor Inicial</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Opt-in</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Aprovados</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Recusados</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950">Simularam</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-emerald-950 border-r border-emerald-100">OK Agente</th>

                        <th className="px-2.5 py-2.5 text-right font-semibold text-teal-950">Aguar. Contato</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-teal-950">Em Atendimento</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-teal-950">Formalizado</th>
                        <th className="px-2.5 py-2.5 text-right font-semibold text-rose-950">Desistência</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {/* Linha 1: Envio Original */}
                      <tr className="hover:bg-slate-50/90 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-100 shrink-0" />
                            <span>Envio Original</span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center border-r border-slate-200">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium text-blue-700 bg-blue-50 border-blue-200">
                            1º Disparo
                          </Badge>
                        </td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.carregados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.enviados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.entregues.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{origFunnel.lidas.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-blue-700 bg-blue-50/40 border-r border-blue-100">{origFunnel.interagiram.toLocaleString('pt-BR')}</td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.confirmaram.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.faturamento.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.valorInicial.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.optIn.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">{origFunnel.aprovados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-50/20">{origFunnel.recusados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{origFunnel.simularam.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20 border-r border-emerald-100">{origFunnel.okAgente.toLocaleString('pt-BR')}</td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-teal-50/20">{origFunnel.aguarContato.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-teal-50/20">{origFunnel.emAtendimento.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-teal-700 bg-teal-50/30">{origFunnel.formalizado.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-teal-50/20">{origFunnel.desistencia.toLocaleString('pt-BR')}</td>
                      </tr>

                      {/* Linha 2: Reengajamento */}
                      <tr className="hover:bg-slate-50/90 transition-colors bg-emerald-50/10">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0" />
                            <span>Reengajamento</span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center border-r border-slate-200">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium text-emerald-700 bg-emerald-50 border-emerald-200">
                            Reativação
                          </Badge>
                        </td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.carregados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.enviados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.entregues.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-blue-50/20">{reengFunnel.lidas.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-600 bg-blue-50/40 border-r border-blue-100">
                          +{reengFunnel.interagiram.toLocaleString('pt-BR')}
                        </td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.confirmaram.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.faturamento.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.valorInicial.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.optIn.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">+{reengFunnel.aprovados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-50/20">{reengFunnel.recusados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20">{reengFunnel.simularam.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-emerald-50/20 border-r border-emerald-100">{reengFunnel.okAgente.toLocaleString('pt-BR')}</td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-teal-50/20">{reengFunnel.aguarContato.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-700 bg-teal-50/20">{reengFunnel.emAtendimento.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-teal-700 bg-teal-50/30">+{reengFunnel.formalizado.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-teal-50/20">{reengFunnel.desistencia.toLocaleString('pt-BR')}</td>
                      </tr>

                      {/* Linha 3: Total Consolidado */}
                      <tr className="bg-slate-100/70 font-semibold border-t-2 border-slate-300">
                        <td className="px-4 py-3 text-slate-900 font-bold">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-800 ring-2 ring-slate-200 shrink-0" />
                            <span>Total Consolidado</span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center border-r border-slate-200">
                          <Badge className="text-[9px] px-1.5 py-0 font-bold bg-slate-800 text-white hover:bg-slate-800">
                            Acumulado
                          </Badge>
                        </td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.carregados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.enviados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.entregues.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-blue-100/40">{totalConsolidado.lidas.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-blue-800 bg-blue-100/60 border-r border-blue-200">{totalConsolidado.interagiram.toLocaleString('pt-BR')}</td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.confirmaram.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.faturamento.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.valorInicial.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.optIn.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-emerald-800 bg-emerald-100/60">{totalConsolidado.aprovados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-emerald-100/40">{totalConsolidado.recusados.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40">{totalConsolidado.simularam.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-emerald-100/40 border-r border-emerald-200">{totalConsolidado.okAgente.toLocaleString('pt-BR')}</td>

                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-teal-100/40">{totalConsolidado.aguarContato.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-900 bg-teal-100/40">{totalConsolidado.emAtendimento.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-teal-800 bg-teal-100/60">{totalConsolidado.formalizado.toLocaleString('pt-BR')}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-rose-600 bg-teal-100/40">{totalConsolidado.desistencia.toLocaleString('pt-BR')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Histórico dos Lotes Executados da Campanha */}
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-muted-foreground" />
                    Lotes de Reengajamento Disparados nesta Campanha
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Auditoria de cada envio secundário enfileirado
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!comparison.batches || comparison.batches.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      Nenhum lote de reengajamento foi registrado nesta campanha ainda.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/60">
                          <tr>
                            <th className="py-2.5 px-3">Data / Hora</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Alvos / Segmentos</th>
                            <th className="py-2.5 px-3 text-right">Contatos no Lote</th>
                            <th className="py-2.5 px-3">Lote ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {comparison.batches.map((batch: any) => (
                            <tr key={batch.id} className="hover:bg-muted/20">
                              <td className="py-2.5 px-3 font-medium text-foreground">
                                {batch.started_at
                                  ? format(new Date(batch.started_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                                  : '-'}
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge
                                  variant={batch.status === 'completed' ? 'default' : 'secondary'}
                                  className={`text-[10px] py-0 px-2 font-semibold ${
                                    batch.status === 'completed'
                                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                      : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                  }`}
                                >
                                  {batch.status === 'completed'
                                    ? 'Concluído'
                                    : batch.status === 'running'
                                      ? 'Em Processamento'
                                      : 'Agendado'}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground">
                                {Array.isArray(batch.target_options)
                                  ? batch.target_options.join(', ')
                                  : 'Personalizado'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-foreground">
                                {batch.records_affected || 0}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                                {String(batch.id || '').substring(0, 8)}...
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : selectedCampaignId === 'all' ? (
            <div className="flex items-center justify-between p-4 rounded-xl border border-dashed border-border/80 bg-muted/20 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Selecione uma campanha específica no filtro acima para visualizar também a <strong>Matriz Detalhada do Funil (18 colunas)</strong> e o histórico de lotes individuais.
                </span>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
