import { useState, useMemo, useEffect } from 'react';
import { Cpu, MessageSquare, Mic, Volume2, DollarSign, TrendingUp, Filter, Download, Calendar, CreditCard, Receipt } from 'lucide-react';
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

    const prices = (currentTenant as any)?.planPrices;
    if (!prices || Object.keys(prices).length === 0) return m.cost;

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

      if (m.metricType === 'tokens') {
        totals.tokens += m.value;
        totals.costLLM += cost;
      } else if (m.metricType === 'messages') {
        totals.messages += m.value;
        totals.totalCost += cost; // Explicitly adding message cost since it wasn't being tracked in a separate total
      } else if (m.metricType === 'stt_minutes') {
        totals.stt += m.value;
        totals.costSTT += cost;
      } else if (m.metricType === 'tts_minutes') {
        totals.tts += m.value;
        totals.costTTS += cost;
      }

      if (m.metricType !== 'messages') totals.totalCost += cost;
    });

    return totals;
  }, [filteredMetrics, realAgents, currentTenant]); // Add currentTenant

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
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="kpi-card border-l-4 border-l-accent">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                  <Cpu className="h-5 w-5 text-accent" />
                </div>
                <span className="text-sm text-muted-foreground">Tokens LLM</span>
              </div>
              <p className="text-2xl font-bold mb-2">{tokenDisplay.value}{tokenDisplay.unit}</p>
              <Progress value={consumptionPercentage} className="h-1 mb-1" />
              <p className="text-xs text-muted-foreground">{consumptionPercentage.toFixed(1)}% do contrato</p>
            </div>

            <div className="kpi-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <span className="text-sm text-muted-foreground">Mensagens</span>
              </div>
              <p className="text-2xl font-bold mb-2">{summary.messages.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Volume total processado</p>
            </div>

            <div className="kpi-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Mic className="h-5 w-5" />
                </div>
                <span className="text-sm text-muted-foreground">STT (minutos)</span>
              </div>
              <p className="text-2xl font-bold mb-2">{summary.stt.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Consumo de Canal Voz</p>
            </div>

            <div className="kpi-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Volume2 className="h-5 w-5" />
                </div>
                <span className="text-sm text-muted-foreground">TTS (minutos)</span>
              </div>
              <p className="text-2xl font-bold mb-2">{summary.tts.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Consumo de Canal Voz</p>
            </div>
          </div>

          {/* Projeção & Billing Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Projeção (Etapa 2) */}
            <div className={`kpi-card border-l-4 lg:col-span-1 flex flex-col justify-center ${projectedPercentage > 100 ? 'border-l-destructive bg-destructive/5' : projectedPercentage > 80 ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-primary bg-primary/5'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className={`h-5 w-5 ${projectedPercentage > 80 ? 'text-destructive' : 'text-primary'}`} />
                  <div>
                    <p className="font-medium text-sm">Projeção</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{period === '7d' ? '7' : '30'} dias</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${projectedPercentage > 80 ? 'text-destructive' : ''}`}>{projectedPercentage.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {/* Resumo de Faturamento (Solicitado) */}
            <div className="kpi-card bg-primary/[0.03] border-primary/20 lg:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-primary uppercase">Variável (Uso)</span>
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-bold">R$ {summary.totalCost.toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground mt-1 lowercase">
                {((currentTenant as any)?.planDetails?.monthlyFeeCoversUsage)
                  ? 'abatido da mensalidade até o limite'
                  : 'uso dinâmico (adicional)'}
              </p>
            </div>

            <div className="kpi-card bg-accent/[0.03] border-accent/20 lg:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-accent uppercase">Assinatura Base</span>
                <CreditCard className="h-4 w-4 text-accent" />
              </div>
              <p className="text-xl font-bold">R$ {((currentTenant as any)?.planPrices?.basePrice || 0).toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground mt-1 lowercase">valor fixo de acesso</p>
            </div>

            <div className="kpi-card bg-green-600/[0.05] border-green-600/20 lg:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-green-600 uppercase">A Pagar (Total)</span>
                <Receipt className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-600">
                R$ {(() => {
                  const basePrice = (currentTenant as any)?.planPrices?.basePrice || 0;
                  const usageCost = summary.totalCost;
                  const feeCoversUsage = (currentTenant as any)?.planDetails?.monthlyFeeCoversUsage;

                  // Logic: If fee covers usage, pay MAX(base, usage). Else pay Base + Usage.
                  const total = feeCoversUsage
                    ? Math.max(basePrice, usageCost)
                    : basePrice + usageCost;

                  return total.toFixed(2);
                })()}
              </p>
              <p className="text-[9px] text-green-600/70 mt-1 font-semibold uppercase">
                {(currentTenant as any)?.planDetails?.monthlyFeeCoversUsage
                  ? 'Modelo: Crédito na Mensalidade'
                  : 'Modelo: Mensalidade + Uso'}
              </p>
            </div>
          </div>

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
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
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
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.llmTokenPrice || 0).toFixed(2)}/1k</span>
                        </div>
                        <p className="font-mono">{(agent.tokens / 1000).toFixed(1)}k</p>
                        <p className="text-[10px] text-accent font-semibold">R$ {(agent.tokenCost || 0).toFixed(2)}</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <div className="flex justify-between items-start">
                          <p className="text-muted-foreground">Mensagens</p>
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.messagePrice || 0).toFixed(2)}/un</span>
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
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.llmTokenPrice || 0).toFixed(2)}/1k</span>
                        </div>
                        <p className="font-mono">{(channel.tokens / 1000).toFixed(1)}k</p>
                        <p className="text-[10px] text-accent font-semibold">R$ {(channel.tokenCost || 0).toFixed(2)}</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <div className="flex justify-between items-start">
                          <p className="text-muted-foreground">Mensagens</p>
                          <span className="text-[9px] text-muted-foreground/60 italic">R$ {((currentTenant as any)?.planPrices?.messagePrice || 0).toFixed(2)}/un</span>
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="kpi-card lg:col-span-1">
                  <h3 className="font-semibold mb-6">Breakdown de Custos (Etapa 6)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value">
                          {pieData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-4">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                          <span>{d.name}</span>
                        </div>
                        <span className="font-bold">R$ {d.value.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="kpi-card lg:col-span-2">
                  <h3 className="font-semibold mb-6">Custos Diários Totais</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyTimeline}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                        <Tooltip />
                        <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Custo (R$)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
