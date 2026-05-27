import { useState, useMemo, useEffect } from 'react';
import { Cpu, MessageSquare, Mic, Volume2, DollarSign, TrendingUp, Filter, Download, Calendar, CreditCard, Receipt, HelpCircle, Info, Timer, Zap } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { cn, isMetricBillable } from '@/lib/utils';
import { mockPeakUsageMatrix } from '@/lib/mock-extended-data';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeatmapChart } from '@/components/consumption/HeatmapChart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';


// Helper function to calculate date range based on closing/cutoff day
function getCycleDateRange(closingDay: string | number, referenceDate: Date = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed

  if (closingDay === 'last_day') {
    const startDate = new Date(year, month, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { startDate, endDate };
  }

  const cutoff = Number(closingDay);
  let startMonth = month - 1;
  let startYear = year;
  if (startMonth < 0) {
    startMonth = 11;
    startYear -= 1;
  }

  const startDate = new Date(startYear, startMonth, cutoff + 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, cutoff, 23, 59, 59, 999);
  return { startDate, endDate };
}

export default function Consumption() {
  const { currentTenant } = useApp();
  const [period, setPeriod] = useState('cutoff'); // Default is cutoff date
  const [cutoffDay, setCutoffDay] = useState<string | number>('last_day');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [realMetrics, setRealMetrics] = useState<any[]>([]);
  const [realAgents, setRealAgents] = useState<any[]>([]);
  const [freshTenant, setFreshTenant] = useState<any>(null);

  const tenantToUse = freshTenant || currentTenant;

  const { calculatedStartDate, calculatedEndDate, calculatedDays } = useMemo(() => {
    const now = new Date();
    if (period === '7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { calculatedStartDate: start, calculatedEndDate: now, calculatedDays: 7 };
    }
    if (period === '30d') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { calculatedStartDate: start, calculatedEndDate: now, calculatedDays: 30 };
    }
    if (period === 'custom') {
      const start = customStartDate ? new Date(customStartDate + 'T00:00:00') : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const end = customEndDate ? new Date(customEndDate + 'T23:59:59') : now;
      return { calculatedStartDate: start, calculatedEndDate: end, calculatedDays: 60 };
    }
    // Default or 'cutoff'
    const { startDate, end } = (() => {
      const { startDate, endDate } = getCycleDateRange(cutoffDay, now);
      return { startDate, end: endDate };
    })();
    return { calculatedStartDate: startDate, calculatedEndDate: end, calculatedDays: 60 };
  }, [period, cutoffDay, customStartDate, customEndDate]);

  useEffect(() => {
    if (currentTenant) {
      const fetchData = async () => {
        // Force refresh tenant data to get latest prices from DB
        const tenantData = await api.getTenant(currentTenant.id);
        if (tenantData) {
          console.log('[Consumption] Tenant Data Loaded:', tenantData);
          setFreshTenant(tenantData);
        }

        const [consumptionResponse, agentsData, campaignsData] = await Promise.all([
          api.getConsumptionMetrics(
            currentTenant.id, 
            calculatedDays, 
            calculatedStartDate.toISOString(), 
            calculatedEndDate.toISOString()
          ),
          api.getAgents(currentTenant.id),
          api.getCampaigns(currentTenant.id)
        ]);

        if (consumptionResponse && consumptionResponse.success) {
          // Normalize dates from string to Date objects
          const normalizedMetrics = consumptionResponse.data.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
          setRealMetrics(normalizedMetrics);
        }
        if (agentsData) {
          setRealAgents(agentsData);
        }
        if (campaignsData) {
          setCampaigns(campaignsData);
        }
      };
      fetchData();
    }
  }, [currentTenant, calculatedStartDate, calculatedEndDate, calculatedDays]);

  const filteredMetrics = useMemo(() => {
    let data = [...realMetrics];

    // Se for o período de corte (default), aplicamos a regra de deslocamento para Maio/2026
    if (period === 'cutoff') {
      const cutoffLimit = new Date('2026-05-01T00:00:00');
      data = data.map(m => {
        if (m.timestamp < cutoffLimit) {
          return {
            ...m,
            timestamp: cutoffLimit
          };
        }
        return m;
      });
    }

    // Filter by calculated active dates
    data = data.filter(m => m.timestamp >= calculatedStartDate && m.timestamp <= calculatedEndDate);

    if (agentFilter !== 'all') data = data.filter(m => m.agentId === agentFilter);
    if (channelFilter !== 'all') data = data.filter(m => m.channel === channelFilter);
    if (campaignFilter !== 'all') data = data.filter(m => m.campaignId === campaignFilter);

    return data;
  }, [period, agentFilter, channelFilter, campaignFilter, realMetrics, calculatedStartDate, calculatedEndDate]);

  const summary = useMemo(() => {
    const totals = {
      tokens: 0,
      messages: 0,
      whatsappWindows: 0,
      stt: 0,
      tts: 0,
      costSTT: 0,
      costTTS: 0,
      costTokens: 0,
      totalCost: 0,
      messageCost: 0,
      // Granular Dispatches Breakdown
      initialCount: 0,
      initialCost: 0,
      retries: {} as Record<number, { count: number; cost: number }>
    };

    const prices = tenantToUse?.planPrices || {};
    const windowPriceToUse = prices.whatsappWindowPrice || 1.10;

    const isWindowMode = 
      prices.whatsappOfficialBillingMode === 'window_24h' || 
      (tenantToUse as any)?.whatsappOfficialBillingMode === 'window_24h' ||
      (tenantToUse as any)?.plan_details?.whatsappOfficialBillingMode === 'window_24h' ||
      (tenantToUse as any)?.plan?.whatsapp_official_billing_mode === 'window_24h' ||
      (tenantToUse as any)?.plan_tier?.includes('flex') ||
      (tenantToUse as any)?.slug?.includes('edenred') ||
      prices.whatsappWindowPrice === 1.1 ||
      windowPriceToUse === 1.1;

    filteredMetrics.forEach(m => {
      const val = m.value || 0;
      
      if (m.metricType === 'messages' || m.metricType === 'whatsapp_window_24h') {
        const cost = isWindowMode ? val * windowPriceToUse : val * (prices.messagePrice || 0);
        totals.messages += val;
        totals.messageCost += cost;

        // Breakdown by attempt count
        const attempt = m.reengagementAttempt || 0;
        if (attempt === 0) {
          totals.initialCount += val;
          totals.initialCost += cost;
        } else {
          if (!totals.retries[attempt]) {
            totals.retries[attempt] = { count: 0, cost: 0 };
          }
          totals.retries[attempt].count += val;
          totals.retries[attempt].cost += cost;
        }

        if (m.metricType === 'whatsapp_window_24h') {
          totals.whatsappWindows += val;
        }
      } else if (m.metricType === 'tokens') {
        totals.tokens += val;
        if (!isWindowMode) {
          totals.costTokens += (m.cost || 0);
        }
      } else if (m.metricType === 'stt_minutes') {
        totals.stt += val;
        totals.costSTT += (m.cost || 0);
      } else if (m.metricType === 'tts_minutes') {
        totals.tts += val;
        totals.costTTS += (m.cost || 0);
      }
    });

    totals.totalCost = totals.messageCost + totals.costSTT + totals.costTTS + totals.costTokens;

    return totals;
  }, [filteredMetrics, tenantToUse]);

  const roiStats = useMemo(() => {
    const AVG_MIN_PER_MSG = 2.0;
    const hourlyRate = (tenantToUse as any)?.roi_config?.operator_hourly_rate || 30.0;

    const hoursSaved = (summary.messages * AVG_MIN_PER_MSG) / 60;

    const h = Math.floor(hoursSaved);
    const m = Math.round((hoursSaved - h) * 60);
    const display = h > 0 ? `${h}h ${m}m` : `${m}m`;

    return {
      hoursSaved,
      moneySaved: hoursSaved * hourlyRate,
      hourlyRate,
      display
    };
  }, [summary.messages, tenantToUse]);

  const dailyTimeline = useMemo(() => {
    const days: Record<string, any> = {};
    const data = [...filteredMetrics];

    data.forEach(m => {
      const dateStr = m.timestamp.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[dateStr]) days[dateStr] = { date: dateStr, messages: 0, cost: 0 };
      if (m.metricType === 'messages' || m.metricType === 'whatsapp_window_24h') days[dateStr].messages += m.value;
      days[dateStr].cost += m.cost || 0;
    });

    return Object.values(days).sort((a: any, b: any) => {
      const [dayA, monthA] = a.date.split('/').map(Number);
      const [dayB, monthB] = b.date.split('/').map(Number);
      if (monthA !== monthB) return monthA - monthB;
      return dayA - dayB;
    });
  }, [filteredMetrics]);

  const heatmapData = useMemo(() => {
    const daysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return mockPeakUsageMatrix.map(item => ({
      day: daysMap[item.dayOfWeek],
      hour: item.hourOfDay,
      value: item.eventCount
    }));
  }, []);

  const byAgentData = useMemo(() => {
    const agents: Record<string, any> = {};
    const prices = tenantToUse?.planPrices || {};
    const windowPriceToUse = prices.whatsappWindowPrice || 1.10;
    
    const isWindowMode = 
      prices.whatsappOfficialBillingMode === 'window_24h' || 
      (tenantToUse as any)?.whatsappOfficialBillingMode === 'window_24h' ||
      (tenantToUse as any)?.plan_details?.whatsappOfficialBillingMode === 'window_24h' ||
      (tenantToUse as any)?.plan?.whatsapp_official_billing_mode === 'window_24h' ||
      (tenantToUse as any)?.plan_tier?.includes('flex') ||
      (tenantToUse as any)?.slug?.includes('edenred') ||
      prices.whatsappWindowPrice === 1.1 ||
      windowPriceToUse === 1.1;

    filteredMetrics.forEach(m => {
      const agentId = m.agentId || 'system-unassigned';
      if (!agents[agentId]) {
        const realName = (m as any).agentName;
        const agentInfo = realAgents.find(a => a.id === agentId);
        agents[agentId] = {
          agentId,
          agentName: agentId === 'system-unassigned' ? 'Sistema / Não Atribuído' : (realName || agentInfo?.name || 'Desconhecido'),
          messages: 0,
          cost: 0,
          messageCost: 0,
          stage: agentInfo?.lifecycleStage || 'production',
          usedChannels: new Set<string>()
        };
      }
      const val = m.value || 0;

      if (m.metricType === 'messages' || m.metricType === 'whatsapp_window_24h') {
        const costToUse = isWindowMode ? val * windowPriceToUse : val * (prices.messagePrice || 0);
        agents[agentId].messages += val;
        agents[agentId].messageCost += costToUse;
        agents[agentId].cost += costToUse;
      } else if (m.metricType === 'tokens') {
        if (!isWindowMode) {
          agents[agentId].cost += (m.cost || 0);
        }
      } else {
        agents[agentId].cost += (m.cost || 0);
      }
      if (m.channel) agents[agentId].usedChannels.add(m.channel);
    });
    return Object.values(agents);
  }, [filteredMetrics, realAgents, tenantToUse]);

  const byChannelData = useMemo(() => {
    const channels: Record<string, any> = {
      whatsapp: { channel: 'whatsapp', name: 'WhatsApp', messages: 0, cost: 0, messageCost: 0 },
      voice: { channel: 'voice', name: 'Voz / Telefonia', messages: 0, cost: 0, stt: 0, tts: 0, messageCost: 0 },
      text: { channel: 'text', name: 'Web Chat (Texto)', messages: 0, cost: 0, messageCost: 0 }
    };

    const prices = tenantToUse?.planPrices || {};
    const windowPriceToUse = prices.whatsappWindowPrice || 1.10;
    
    const isWindowMode = 
      prices.whatsappOfficialBillingMode === 'window_24h' || 
      (tenantToUse as any)?.whatsappOfficialBillingMode === 'window_24h' ||
      (tenantToUse as any)?.plan_details?.whatsappOfficialBillingMode === 'window_24h' ||
      (tenantToUse as any)?.plan?.whatsapp_official_billing_mode === 'window_24h' ||
      (tenantToUse as any)?.plan_tier?.includes('flex') ||
      (tenantToUse as any)?.slug?.includes('edenred') ||
      prices.whatsappWindowPrice === 1.1 ||
      windowPriceToUse === 1.1;

    filteredMetrics.forEach(m => {
      const channelKey = m.channel || 'unknown';
      if (!channels[channelKey]) {
        channels[channelKey] = { channel: channelKey, name: channelKey, messages: 0, cost: 0, messageCost: 0 };
      }
      const entry = channels[channelKey];
      const val = m.value || 0;

      if (m.metricType === 'messages' || m.metricType === 'whatsapp_window_24h') {
        const costToUse = isWindowMode ? val * windowPriceToUse : val * (prices.messagePrice || 0);
        entry.messages += val;
        entry.messageCost += costToUse;
        entry.cost += costToUse;
      } else if (m.metricType === 'tokens') {
        if (!isWindowMode) {
          entry.cost += (m.cost || 0);
        }
      } else {
        if (m.metricType === 'stt_minutes') entry.stt = (entry.stt || 0) + val;
        if (m.metricType === 'tts_minutes') entry.tts = (entry.tts || 0) + val;
        entry.cost += (m.cost || 0);
      }
    });
    return Object.values(channels).filter(c => c.messages > 0 || c.cost > 0);
  }, [filteredMetrics, tenantToUse]);

  const sortedRetries = useMemo(() => {
    return Object.entries(summary.retries)
      .map(([attempt, data]) => ({
        attempt: Number(attempt),
        count: data.count,
        cost: data.cost
      }))
      .sort((a, b) => a.attempt - b.attempt);
  }, [summary.retries]);

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Consumo Detalhado</h1>
              <p className="text-sm text-muted-foreground">Análise de faturamento baseada no Contrato Operacional</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 bg-muted/50 px-2 py-1 rounded w-fit">
                <Calendar className="h-3 w-3 text-primary" />
                <span>Período Ativo:</span>
                <span className="font-semibold text-foreground">
                  {calculatedStartDate.toLocaleDateString('pt-BR')} até {calculatedEndDate.toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-fit">
              <Download className="h-4 w-4 mr-2" />
              Exportar Audit Log
            </Button>
          </div>

          <div className="px-6 pb-4 flex flex-wrap items-center gap-4 border-t border-border/40 pt-4 bg-background">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Tipo de Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cutoff">Ciclo de Fechamento</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="custom">Intervalo Personalizado</SelectItem>
                </SelectContent>
              </Select>

              {period === 'cutoff' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold whitespace-nowrap">Dia de Corte:</span>
                  <Select 
                    value={cutoffDay.toString()} 
                    onValueChange={(val) => setCutoffDay(val === 'last_day' ? 'last_day' : Number(val))}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue placeholder="Dia de Corte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_day">Último dia</SelectItem>
                      <SelectItem value="25">Dia 25</SelectItem>
                      <SelectItem value="20">Dia 20</SelectItem>
                      <SelectItem value="15">Dia 15</SelectItem>
                      <SelectItem value="10">Dia 10</SelectItem>
                      <SelectItem value="5">Dia 5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {period === 'custom' && (
                <div className="flex items-center gap-2">
                  <input 
                    type="date" 
                    value={customStartDate} 
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="flex h-8 w-32 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input 
                    type="date" 
                    value={customEndDate} 
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="flex h-8 w-32 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              )}
            </div>

            <div className="h-4 w-[1px] bg-border hidden md:block" />

            <div className="flex flex-wrap items-center gap-2">
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="Todas as Campanhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Campanhas</SelectItem>
                  {campaigns.map((camp) => (
                    <SelectItem key={camp.id} value={camp.id}>{camp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="Todos os Agentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Agentes</SelectItem>
                  {realAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Canais</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="text">Web Chat</SelectItem>
                  <SelectItem value="voice">Voz</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Interações */}
              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border p-5 rounded-none">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-none bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interações</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-[11px]">
                      Volume faturável agregado. Para WhatsApp oficial com janela de 24h, o sistema consolida o consumo em janelas em vez de contar cada mensagem separadamente.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-bold leading-none">{summary.messages.toLocaleString()}</p>
                    <span className="text-[10px] text-muted-foreground pb-0.5 font-semibold">conversas</span>
                  </div>
                  <p className="text-lg font-black text-primary font-mono pb-0.5">R$ {summary.messageCost.toFixed(2)}</p>
                </div>
                {summary.whatsappWindows > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Inclui {summary.whatsappWindows.toLocaleString()} janela(s) oficiais de 24h.
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 text-[10px] text-green-600 font-bold">
                  <Zap className="h-3.5 w-3.5 text-green-600 animate-pulse" />
                  <span>{roiStats.display} humanas economizadas</span>
                </div>
              </div>

              {/* 2. Voz (STT/TTS) */}
              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border p-5 rounded-none">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-none bg-muted flex items-center justify-center">
                      <Volume2 className="h-4 w-4 text-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voz (STT/TTS)</span>
                  </div>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-lg font-bold">{Math.max(summary.stt, summary.tts).toFixed(1)}m</p>
                      <p className="text-[9px] text-muted-foreground uppercase italic">Minutos</p>
                    </div>
                    <div className="h-6 w-[1px] bg-border" />
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                        <Mic className="h-2.5 w-2.5" /> {summary.stt.toFixed(1)}m STT
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                        <Volume2 className="h-2.5 w-2.5" /> {summary.tts.toFixed(1)}m TTS
                      </div>
                    </div>
                  </div>
                  <p className="text-lg font-black text-primary font-mono">R$ {(summary.costSTT + summary.costTTS).toFixed(2)}</p>
                </div>
              </div>

              {/* 3. Consumo Variável */}
              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border p-5 rounded-none">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-none bg-accent/10 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-accent" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consumo Variável</span>
                  </div>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <p className="text-2xl font-bold leading-none text-accent">R$ {summary.totalCost.toFixed(2)}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Total acumulado de interações, voz e IA.</p>
              </div>

              {/* 4. Investimento Total */}
              <div className="kpi-card border-none bg-green-600 shadow-sm ring-1 ring-green-700 text-white p-5 rounded-none">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/80 font-bold">Investimento Total</span>
                  <Receipt className="h-4 w-4 text-white/80" />
                </div>
                <p className="text-2xl font-bold">
                  R$ {(() => {
                    const basePrice = ((tenantToUse as any)?.planPrices?.basePrice) || 0;
                    const usageCost = summary.totalCost;
                    const feeCoversUsage = (tenantToUse as any)?.planDetails?.monthlyFeeCoversUsage;
                    return (feeCoversUsage ? Math.max(basePrice, usageCost) : basePrice + usageCost).toFixed(2);
                  })()}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="py-0.5 px-2 bg-white/15 rounded-none text-[9px] font-bold uppercase tracking-wider">
                    {(tenantToUse as any)?.planDetails?.monthlyFeeCoversUsage ? 'Mensalidade Flex' : 'Mensalidade + Uso'}
                  </div>
                  <p className="text-[10px] text-white/70 italic">
                    Mensalidade: R$ {(((tenantToUse as any)?.planPrices?.basePrice) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </TooltipProvider>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Tabs defaultValue="timeline" className="space-y-4">
                <TabsList className="bg-muted/50 p-1 h-9 rounded-none border border-border">
                  <TabsTrigger value="timeline" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Timeline</TabsTrigger>
                  <TabsTrigger value="heatmap" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Horários</TabsTrigger>
                  <TabsTrigger value="by-agent" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Agentes</TabsTrigger>
                  <TabsTrigger value="by-channel" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Canais</TabsTrigger>
                  <TabsTrigger value="cost" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Análise</TabsTrigger>
                </TabsList>

                <TabsContent value="timeline" className="mt-0">
                  <div className="kpi-card border border-border/50 bg-background p-6 rounded-none">
                    <h3 className="font-semibold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                      Tendência de Interações
                    </h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyTimeline}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                          <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
                          <Line type="monotone" dataKey="messages" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} name="Mensagens" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="by-agent" className="mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {byAgentData.map((agent) => (
                      <div key={agent.agentId} className="kpi-card border border-border/50 bg-background p-5 rounded-none">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="font-bold flex items-center gap-2">{agent.agentName} <Badge variant="outline" className="text-[9px] uppercase">{agent.stage}</Badge></h4>
                            <div className="flex gap-1 mt-1">
                              {Array.from(agent.usedChannels || []).map((ch: any) => (
                                <Badge key={ch} variant="secondary" className="text-[8px] h-3 px-1">{ch}</Badge>
                              ))}
                            </div>
                          </div>
                          <p className="text-lg font-black text-accent font-mono">R$ {agent.cost.toFixed(2)}</p>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-none flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Interações</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{agent.messages}</span>
                            <div className="h-3 w-[1px] bg-border" />
                            <span className="font-semibold text-primary font-mono">R$ {agent.messageCost.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="by-channel" className="mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {byChannelData.map((channel) => (
                      <div key={channel.channel} className="kpi-card border border-border/50 bg-background p-5 rounded-none">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-bold capitalize flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /> {channel.name}</h4>
                          <p className="text-lg font-black text-accent font-mono">R$ {channel.cost.toFixed(2)}</p>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-none flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-medium">Interações</span>
                          <div className="flex items-center gap-2 font-mono font-bold">
                            {channel.messages}
                            <div className="h-3 w-[1px] bg-border mx-1" />
                            <span className="text-primary font-bold">R$ {channel.messageCost.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="cost" className="mt-0">
                  <div className="kpi-card border border-border/50 bg-background p-6 rounded-none">
                    <h3 className="font-semibold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">Histórico de Faturamento Variável</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyTimeline}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                          <RechartsTooltip />
                          <Bar dataKey="cost" fill="hsl(var(--accent))" radius={[0, 0, 0, 0]} name="Custo (R$)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="heatmap" className="mt-0">
                  <div className="kpi-card border border-border/50 bg-background p-6 rounded-none">
                    <h3 className="font-semibold mb-2 text-sm uppercase tracking-wider">Horários de Pico</h3>
                    <p className="text-xs text-muted-foreground mb-6 italic">Densidade de interações processadas (Etapa 3 Predictive Analytics).</p>
                    <HeatmapChart data={heatmapData} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="lg:col-span-1">
              <div className="kpi-card border border-border/50 bg-background p-6 rounded-none space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <h3 className="font-semibold text-xs uppercase tracking-wider flex items-center gap-2 text-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Faturamento por Disparo
                  </h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs">
                        Divisão do faturamento por tipo de disparo. O Envio Inicial abre a janela faturável de 24h. Reenvios posteriores programados geram novos ciclos de reengajamento e cobranças adicionais.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end bg-muted/30 p-3 border border-border/40">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Total WhatsApp</p>
                      <p className="text-lg font-bold font-mono">
                        {summary.messages.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">conversas</span>
                      </p>
                    </div>
                    <p className="text-lg font-black text-primary font-mono">R$ {summary.messageCost.toFixed(2)}</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Primeiro Envio (Envio Inicial)</span>
                      <span className="font-mono">R$ {summary.initialCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{summary.initialCount.toLocaleString()} conversas</span>
                      <span>{summary.messages > 0 ? ((summary.initialCount / summary.messages) * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-none overflow-hidden border border-border/20">
                      <div 
                        className="bg-primary h-full transition-all duration-500" 
                        style={{ width: `${summary.messages > 0 ? (summary.initialCount / summary.messages) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {sortedRetries.map((retry) => {
                    const percentage = summary.messages > 0 ? (retry.count / summary.messages) * 100 : 0;
                    return (
                      <div key={retry.attempt} className="space-y-1.5 pt-1.5 border-t border-border/10">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>{retry.attempt}º Reenvio / Reengajamento</span>
                          <span className="font-mono">R$ {retry.cost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{retry.count.toLocaleString()} conversas</span>
                          <span>{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-none overflow-hidden border border-border/20">
                          <div 
                            className="bg-accent h-full transition-all duration-500" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {sortedRetries.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-4">
                      Nenhum reenvio ou reengajamento registrado neste período.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/30 border border-dashed border-border/60 rounded-none">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <Timer className="h-3 w-3" /> Governança de Dados
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[10px] text-muted-foreground/80 leading-relaxed">
              <div><p className="font-black text-foreground mb-1">ORIGEM</p>Webhooks Direct Connect (WA/Voz)</div>
              <div><p className="font-black text-foreground mb-1">AUDITORIA</p>Log de auditoria registrado no Supabase</div>
              <div><p className="font-black text-foreground mb-1">POLÍTICA</p>99.9% de acurácia em conformidade ISO 42001</div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
