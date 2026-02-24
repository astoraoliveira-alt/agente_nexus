import { useState, useMemo, useEffect } from 'react';
import { Cpu, MessageSquare, Mic, Volume2, DollarSign, TrendingUp, Filter, Download, Calendar, CreditCard, Receipt, HelpCircle, Info, Timer, Zap } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockAgents, mockTenants } from '@/lib/mock-data';
import { mockPeakUsageMatrix } from '@/lib/mock-extended-data';
import { calculateProjection, isMetricBillable } from '@/lib/consumption-logic';
import { useApp } from '@/contexts/AppContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COLORS = ['hsl(192, 91%, 36%)', 'hsl(222, 47%, 35%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)'];

export default function Consumption() {
  const { openSlideOver, currentTenant } = useApp();
  const [period, setPeriod] = useState('30d');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [realMetrics, setRealMetrics] = useState<any[]>([]);
  const [realAgents, setRealAgents] = useState<any[]>([]); // New State for Agents

  // Fetch Real Data
  useEffect(() => {
    if (currentTenant) {
      const fetchData = async () => {
        console.log('Fetching data for consumption view:', currentTenant.id);
        const [metricsData, agentsData] = await Promise.all([
          api.getConsumptionMetrics(currentTenant.id, 60),
          api.getAgents(currentTenant.id)
        ]);

        if (metricsData && metricsData.length > 0) {
          console.log('Consumption Data Received:', metricsData);
          setRealMetrics(metricsData);
        } else {
          console.log('No Consumption Data Received');
        }
        if (agentsData) {
          setRealAgents(agentsData);
        }
      };
      fetchData();
    }
  }, [currentTenant]);

  // Unified Metrics Calculation (Etapa 1 & 6)
  const filteredMetrics = useMemo(() => {
    let data = [...realMetrics];
    const now = new Date();

    // Period Filter
    if (period === '7d') data = data.filter(m => (now.getTime() - m.timestamp.getTime()) < 7 * 24 * 60 * 60 * 1000);
    if (period === '30d') data = data.filter(m => (now.getTime() - m.timestamp.getTime()) < 30 * 24 * 60 * 60 * 1000);

    // Agent Filter
    if (agentFilter !== 'all') data = data.filter(m => m.agentId === agentFilter);

    // Channel Filter
    if (channelFilter !== 'all') data = data.filter(m => m.channel === channelFilter);

    return data;
  }, [period, agentFilter, channelFilter, realMetrics]);

  // Helper for dynamic cost calculation (Etapa 6 Fix)
  const calculateMetricCost = (m: any) => {
    const agent = realAgents.find(a => a.id === m.agentId);
    const stage = agent ? agent.lifecycleStage : 'production';
    if (!isMetricBillable(stage)) return 0;

    let prices = (currentTenant as any)?.planPrices;
    // Fallback if tenant JSON is missing prices
    if (!prices || Object.keys(prices).length === 0) {
      prices = {
        basePrice: 2499.00,
        llmTokenPrice: 0.10, // R$ 0.10 por 1k tokens
        messagePrice: 1.00,  // R$ 1.00 por mensagem
        sttMinutePrice: 0.30,
        ttsMinutePrice: 0.30
      };
    }

    if (m.metricType === 'tokens') return (m.value / 1000) * (prices.llmTokenPrice || 0);
    if (m.metricType === 'messages') return m.value * (prices.messagePrice || 0);
    if (m.metricType === 'stt_minutes') return m.value * (prices.sttMinutePrice || 0);
    if (m.metricType === 'tts_minutes') return m.value * (prices.ttsMinutePrice || 0);
    return m.cost;
  };

  const summary = useMemo(() => {
    const totals = {
      tokens: 0,
      messages: 0,
      stt: 0,
      tts: 0,
      costLLM: 0,
      costSTT: 0,
      costTTS: 0,
      totalCost: 0
    };

    filteredMetrics.forEach(m => {
      const cost = calculateMetricCost(m);

      // Calculate total cost for all metrics exactly once
      totals.totalCost += cost;

      if (m.metricType === 'tokens') {
        totals.tokens += m.value;
        totals.costLLM += cost;
      } else if (m.metricType === 'messages') {
        totals.messages += m.value;
      } else if (m.metricType === 'stt_minutes') {
        totals.stt += m.value;
        totals.costSTT += cost;
      } else if (m.metricType === 'tts_minutes') {
        totals.tts += m.value;
        totals.costTTS += cost;
      }
    });

    return totals;
  }, [filteredMetrics, realAgents, currentTenant]); // Add currentTenant

  // ROI Calculation: Efficiency (Etapa ROI)
  const roiStats = useMemo(() => {
    const config = (currentTenant as any)?.roi_config || {
      avg_human_minutes_per_interaction: 2.5,
      operator_hourly_rate: 30.0
    };

    const avgHumanMinutes = config.avg_human_minutes_per_interaction;
    const totalInteractions = summary.messages;
    const hoursSaved = (totalInteractions * avgHumanMinutes) / 60;

    // Estimate cost saved based on operator rate
    const operatorHourlyRate = config.operator_hourly_rate;
    const moneySaved = hoursSaved * operatorHourlyRate;

    return {
      hoursSaved,
      moneySaved,
      hourlyRate: operatorHourlyRate
    };
  }, [summary.messages, currentTenant]);

  // Daily Aggregation for Timeline (Etapa 2)
  const dailyTimeline = useMemo(() => {
    const days: Record<string, any> = {};
    filteredMetrics.forEach(m => {
      const dateStr = m.timestamp.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[dateStr]) days[dateStr] = { date: dateStr, tokens: 0, messages: 0, cost: 0 };

      if (m.metricType === 'tokens') days[dateStr].tokens += m.value;
      if (m.metricType === 'messages') days[dateStr].messages += m.value;
      days[dateStr].cost += calculateMetricCost(m);
    });
    return Object.values(days).reverse();
  }, [filteredMetrics, realAgents, currentTenant]);

  const tenantLimit = (currentTenant as any)?.limits?.llmTokens || 1000000;
  const consumptionPercentage = (summary.tokens / tenantLimit) * 100;
  const projectedPercentage = calculateProjection(summary.tokens, tenantLimit, period === '7d' ? 7 : 30);

  // Dynamic Token Formatting
  const tokenDisplay = summary.tokens > 1000000
    ? { value: (summary.tokens / 1000000).toFixed(2), unit: 'M' }
    : { value: (summary.tokens / 1000).toFixed(1), unit: 'k' };

  const pieData = [
    { name: 'LLM', value: summary.costLLM },
    { name: 'STT', value: summary.costSTT },
    { name: 'TTS', value: summary.costTTS },
  ];

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
    filteredMetrics.forEach(m => {
      const cost = calculateMetricCost(m); // Fix scope

      // Handle metrics without agentId (System or Unassigned) recursively
      const agentId = m.agentId || 'system-unassigned';

      if (!agents[agentId]) {
        const realName = (m as any).agentName;
        const agentInfo = realAgents.find(a => a.id === agentId);

        agents[agentId] = {
          agentId: agentId,
          agentName: agentId === 'system-unassigned' ? 'Sistema / Não Atribuído' : (realName || agentInfo?.name || 'Desconhecido'),
          tokens: 0,
          messages: 0,
          cost: 0,
          stage: agentInfo?.lifecycleStage || 'production',
          usedChannels: new Set<string>() // Track channels
        };
      }
      if (m.metricType === 'tokens') {
        agents[agentId].tokens += m.value;
        agents[agentId].tokenCost = (agents[agentId].tokenCost || 0) + cost;
      }
      if (m.metricType === 'messages') {
        agents[agentId].messages += m.value;
        agents[agentId].messageCost = (agents[agentId].messageCost || 0) + cost;
      }

      // Track channel usage
      if (m.channel) agents[agentId].usedChannels.add(m.channel);

      agents[agentId].cost += cost;
    });
    return Object.values(agents);
  }, [filteredMetrics, realAgents, currentTenant]); // Add currentTenant

  const byChannelData = useMemo(() => {
    const channels: Record<string, any> = {
      whatsapp: { channel: 'whatsapp', name: 'WhatsApp', tokens: 0, messages: 0, cost: 0, tokenCost: 0, messageCost: 0 },
      voice: { channel: 'voice', name: 'Voz / Telefonia', tokens: 0, messages: 0, cost: 0, stt: 0, tts: 0, tokenCost: 0, messageCost: 0 },
      text: { channel: 'text', name: 'Web Chat (Texto)', tokens: 0, messages: 0, cost: 0, tokenCost: 0, messageCost: 0 }
    };

    filteredMetrics.forEach(m => {
      const channelKey = m.channel || 'unknown';
      const cost = calculateMetricCost(m);

      // Dynamic creation if channel doesn't exist (e.g. 'instagram' or others)
      if (!channels[channelKey]) {
        channels[channelKey] = {
          channel: channelKey,
          name: channelKey.charAt(0).toUpperCase() + channelKey.slice(1),
          tokens: 0,
          messages: 0,
          cost: 0,
          stt: 0,
          tts: 0,
          tokenCost: 0,
          messageCost: 0
        };
      }

      const entry = channels[channelKey];
      if (m.metricType === 'tokens') {
        entry.tokens += m.value;
        entry.tokenCost += cost;
      }
      if (m.metricType === 'messages') {
        entry.messages += m.value;
        entry.messageCost += cost;
      }
      if (m.metricType === 'stt_minutes') entry.stt += m.value;
      if (m.metricType === 'tts_minutes') entry.tts += m.value;

      entry.cost += cost;
    });

    return Object.values(channels).filter(c => c.messages > 0 || c.cost > 0 || c.tokens > 0);
  }, [filteredMetrics, realAgents, currentTenant]);

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Consumo Detalhado</h1>
                <p className="text-sm text-muted-foreground">Análise de métricas baseada no Contrato Operacional (ISO 42001)</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Audit Log
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 mt-4">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-40">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>

              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos os Agentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Agentes</SelectItem>
                  {realAgents.length > 0 ? (
                    realAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} <span className="text-xs text-muted-foreground ml-1">({agent.lifecycleStage || 'production'})</span>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground">Nenhum agente encontrado</div>
                  )}
                </SelectContent>
              </Select>

              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
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
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center">
                      <Cpu className="h-4 w-4 text-accent" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saldo de Inteligência</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-accent transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-[11px]">
                      Tokens são "pedaços" de palavras processados pela IA. Seu plano inclui uma franquia mensal de tokens para os cérebros dos seus agentes.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <p className="text-2xl font-bold leading-none">{tokenDisplay.value}{tokenDisplay.unit}</p>
                  <span className="text-[10px] text-muted-foreground pb-0.5">gastos</span>
                </div>
                <Progress value={Math.min(consumptionPercentage, 100)} className="h-1 mb-1" />
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-muted-foreground font-medium">{consumptionPercentage.toFixed(1)}% do contrato</p>
                  {consumptionPercentage > 100 && <Badge variant="destructive" className="h-4 text-[8px] uppercase px-1">Excedido</Badge>}
                </div>
              </div>

              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interações</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-[11px]">
                      Volume total de mensagens processadas pelos seus agentes em todos os canais (WhatsApp, Web, Voz).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-bold leading-none">{summary.messages.toLocaleString()}</p>
                  <span className="text-[10px] text-muted-foreground pb-0.5">mensagens</span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-green-600 font-medium">
                  <Zap className="h-3 w-3" />
                  <span>Economia de {roiStats.hoursSaved.toFixed(0)}h humanas</span>
                </div>
              </div>

              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center">
                      <Volume2 className="h-4 w-4 text-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Canal de Voz</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-[11px]">
                      Consumo acumulado de minutos de fala (TTS) e transcrição (STT) em ligações telefônicas.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-lg font-bold">{(summary.stt + summary.tts).toFixed(1)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Minutos totais</p>
                  </div>
                  <div className="h-8 w-[1px] bg-border" />
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <Mic className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Ouvido: {summary.stt.toFixed(1)}m</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <Volume2 className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Falado: {summary.tts.toFixed(1)}m</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-sm bg-green-600/10 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Eficácia (ROI)</span>
                  </div>
                </div>
                <div className="mb-2">
                  <p className="text-2xl font-bold leading-none text-green-600 text-shadow-sm">R$ {roiStats.moneySaved.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Valor operacional economizado</p>
                </div>
                <div className="text-[9px] bg-green-50 text-green-700 px-2 py-1 -mx-4 -mb-4 mt-3 font-medium">
                  Baseado em R$ {roiStats.hourlyRate.toFixed(2)}/h de operador
                </div>
              </div>
            </div>

            {/* Projeção & Billing Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-6">
              <div className={`kpi-card border-none shadow-sm ring-1 ring-border flex flex-col justify-between ${projectedPercentage > 100 ? 'bg-destructive/5' : projectedPercentage > 80 ? 'bg-amber-500/5' : 'bg-primary/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Timer className={`h-4 w-4 ${projectedPercentage > 80 ? 'text-destructive' : 'text-primary'}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Predictor de Fatura</span>
                  </div>
                  <Badge variant={projectedPercentage > 80 ? "destructive" : "secondary"} className="h-4 text-[8px] px-1 uppercase">
                    {period === '7d' ? '7' : '30'} dias
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold ${projectedPercentage > 80 ? 'text-destructive' : 'text-primary'}`}>{projectedPercentage.toFixed(1)}%</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">Estimativa de consumo final do ciclo</p>
                </div>
              </div>

              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border lg:col-span-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Variável (Uso)</span>
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold tracking-tight">R$ {summary.totalCost.toFixed(2)}</p>
                <div className="mt-2 flex items-center gap-1">
                  <Info className="h-2.5 w-2.5 text-muted-foreground/60" />
                  <p className="text-[9px] text-muted-foreground lowercase">
                    {((currentTenant as any)?.planDetails?.monthlyFeeCoversUsage)
                      ? 'deduzido do crédito disponível'
                      : 'consumo sob demanda (adicional)'}
                  </p>
                </div>
              </div>

              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border lg:col-span-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Mensalidade Ativa</span>
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold tracking-tight">
                  R$ {(((currentTenant as any)?.planPrices?.basePrice) || 2499.00).toFixed(2)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-1 font-medium">Valor fixo contratado</p>
              </div>

              <div className="kpi-card border-none bg-green-600 shadow-sm ring-1 ring-green-700 lg:col-span-1 text-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-tight text-white/80">Investimento Total</span>
                  <Receipt className="h-4 w-4 text-white/80" />
                </div>
                <p className="text-2xl font-bold">
                  R$ {(() => {
                    const basePrice = ((currentTenant as any)?.planPrices?.basePrice) || 2499.00;
                    const usageCost = summary.totalCost;
                    const feeCoversUsage = (currentTenant as any)?.planDetails?.monthlyFeeCoversUsage;

                    const total = feeCoversUsage
                      ? Math.max(basePrice, usageCost)
                      : basePrice + usageCost;

                    return total.toFixed(2);
                  })()}
                </p>
                <div className="mt-3 py-1 px-2 bg-white/10 rounded text-[9px] font-semibold uppercase tracking-wider inline-block">
                  {(currentTenant as any)?.planDetails?.monthlyFeeCoversUsage
                    ? 'Mensalidade Flex'
                    : 'Mensalidade + Uso'}
                </div>
              </div>
            </div>
          </TooltipProvider>

          <Tabs defaultValue="timeline" className="space-y-4">
            <TabsList>
              <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
              <TabsTrigger value="heatmap">Horários de Pico</TabsTrigger>
              <TabsTrigger value="by-agent">Por Agente</TabsTrigger>
              <TabsTrigger value="by-channel">Por Canal</TabsTrigger>
              <TabsTrigger value="cost">Análise de Custo</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="space-y-4">
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Tendência de Consumo</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyTimeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
                      <Legend />
                      <Line type="monotone" dataKey="tokens" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="Tokens" />
                      <Line type="monotone" dataKey="messages" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Mensagens" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="heatmap" className="space-y-4">
              <div className="kpi-card">
                <h3 className="font-semibold mb-2">Heatmap de Utilização (Etapa 3)</h3>
                <p className="text-sm text-muted-foreground mb-6">Fonte Lógica: Agregação de mensagens recebidas por hora/dia.</p>
                <HeatmapChart data={heatmapData} />
                <div className="mt-6 p-3 bg-muted rounded text-xs text-muted-foreground">
                  <strong>Nota Técnica:</strong> Este dado reflete a matriz de carga futura do N8N. Intensidade calculada via <code>PeakUsageMatrix</code>.
                </div>
              </div>
            </TabsContent>

            <TabsContent value="by-agent" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {byAgentData.map((agent) => (
                  <div key={agent.agentId} className="kpi-card border border-border/50">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold">{agent.agentName}</h4>
                          <div className="flex gap-1">
                            {Array.from(agent.usedChannels || []).map((ch: any) => ( // Show badges
                              <Badge key={ch} variant="secondary" className="text-[9px] h-4 px-1">{ch}</Badge>
                            ))}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase mt-1">{agent.stage}</Badge>
                      </div>
                      <p className="text-lg font-bold">R$ {agent.cost.toFixed(2)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-muted rounded">
                        <div className="flex justify-between items-start">
                          <p className="text-muted-foreground">Tokens (LLM)</p>
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.llmTokenPrice || 0.10).toFixed(2)}/1k</span>
                        </div>
                        <p className="font-mono">{(agent.tokens / 1000).toFixed(1)}k</p>
                        <p className="text-[10px] text-accent font-semibold">R$ {(agent.tokenCost || 0).toFixed(2)}</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <div className="flex justify-between items-start">
                          <p className="text-muted-foreground">Mensagens</p>
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.messagePrice || 1.00).toFixed(2)}/un</span>
                        </div>
                        <p className="font-mono">{agent.messages}</p>
                        <p className="text-[10px] text-primary font-semibold">R$ {(agent.messageCost || 0).toFixed(2)}</p>
                      </div>
                    </div>

                    {!isMetricBillable(agent.stage) && (
                      <p className="mt-2 text-[10px] text-amber-500 italic">
                        * Estágio {agent.stage} isento de cobrança (ISO 42001 Sandbox Rule).
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="by-channel" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {byChannelData.map((channel) => (
                  <div key={channel.channel} className="kpi-card border border-border/50">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <DollarSign className="h-4 w-4 text-primary" />
                        </div>
                        <h4 className="font-bold capitalize">{channel.name}</h4>
                      </div>
                      <p className="text-lg font-bold">R$ {channel.cost.toFixed(2)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-muted rounded">
                        <div className="flex justify-between items-start">
                          <p className="text-muted-foreground">Tokens (LLM)</p>
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.llmTokenPrice || 0.10).toFixed(2)}/1k</span>
                        </div>
                        <p className="font-mono">{(channel.tokens / 1000).toFixed(1)}k</p>
                        <p className="text-[10px] text-accent font-semibold">R$ {(channel.tokenCost || 0).toFixed(2)}</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <div className="flex justify-between items-start">
                          <p className="text-muted-foreground">Mensagens</p>
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.messagePrice || 1.00).toFixed(2)}/un</span>
                        </div>
                        <p className="font-mono">{channel.messages}</p>
                        <p className="text-[10px] text-primary font-semibold">R$ {(channel.messageCost || 0).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="cost" className="space-y-4">
              <div className="kpi-card">
                <h3 className="font-semibold mb-6">Custos Diários Totais</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyTimeline}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                      <RechartsTooltip />
                      <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Custo (R$)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Audit / Governance Info (Etapa 8) */}
          <div className="p-4 bg-muted/30 border border-dashed rounded-lg">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Governança de Dados de Consumo</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px]">
              <div>
                <p className="font-bold text-muted-foreground">ORIGEM DOS DADOS</p>
                <p>N8N Webhooks (WhatsApp) / Retell AI (Voz)</p>
              </div>
              <div>
                <p className="font-bold text-muted-foreground">RESPONSÁVEL (AUDITORIA)</p>
                <p>Ana Rodrigues (Compliance Officer)</p>
              </div>
              <div>
                <p className="font-bold text-muted-foreground">RETENÇÃO DE MÉTRICAS</p>
                <p>365 dias (conforme política Alpha)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
