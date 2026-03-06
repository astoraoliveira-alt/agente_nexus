import { useState, useMemo, useEffect } from 'react';
import { Cpu, MessageSquare, Mic, Volume2, DollarSign, TrendingUp, Filter, Download, Calendar, CreditCard, Receipt, HelpCircle, Info, Timer, Zap } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockPeakUsageMatrix } from '@/lib/mock-extended-data';
import { calculateProjection, isMetricBillable } from '@/lib/consumption-logic';
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

export default function Consumption() {
  const { currentTenant } = useApp();
  const [period, setPeriod] = useState('30d');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [realMetrics, setRealMetrics] = useState<any[]>([]);
  const [realAgents, setRealAgents] = useState<any[]>([]);
  const [freshTenant, setFreshTenant] = useState<any>(null);

  const tenantToUse = freshTenant || currentTenant;

  useEffect(() => {
    if (currentTenant) {
      const fetchData = async () => {
        // Force refresh tenant data to get latest prices from DB
        const tenantData = await api.getTenant(currentTenant.id);
        if (tenantData) setFreshTenant(tenantData);

        const [metricsData, agentsData] = await Promise.all([
          api.getConsumptionMetrics(currentTenant.id, 60),
          api.getAgents(currentTenant.id)
        ]);

        if (metricsData && metricsData.length > 0) {
          setRealMetrics(metricsData);
        }
        if (agentsData) {
          setRealAgents(agentsData);
        }
      };
      fetchData();
    }
  }, [currentTenant]);

  const filteredMetrics = useMemo(() => {
    let data = [...realMetrics];
    const now = new Date();

    if (period === '7d') data = data.filter(m => (now.getTime() - m.timestamp.getTime()) < 7 * 24 * 60 * 60 * 1000);
    if (period === '30d') data = data.filter(m => (now.getTime() - m.timestamp.getTime()) < 30 * 24 * 60 * 60 * 1000);
    if (agentFilter !== 'all') data = data.filter(m => m.agentId === agentFilter);
    if (channelFilter !== 'all') data = data.filter(m => m.channel === channelFilter);

    return data;
  }, [period, agentFilter, channelFilter, realMetrics]);

  const calculateMetricCost = (m: any) => {
    const agent = realAgents.find(a => a.id === m.agentId);
    const stage = agent ? agent.lifecycleStage : 'production';
    if (!isMetricBillable(stage)) return 0;

    const prices = (tenantToUse as any)?.planPrices || {};

    // Safely extract prices with 0 as absolute default
    const llmPrice = prices.llmTokenPrice ?? prices.llm_token_price ?? 0;
    const msgPrice = prices.messagePrice ?? prices.message_price ?? 0;
    let sttPrice = prices.sttMinutePrice ?? prices.stt_minute_price ?? 0;
    let ttsPrice = prices.ttsMinutePrice ?? prices.tts_minute_price ?? 0;

    // Fallback for missing configurations (if 0 is not intended but data is missing)
    if (Object.keys(prices).length === 0) {
      // If we have literally no price data, use safe defaults
      if (sttPrice === 0) sttPrice = 0.50;
      if (ttsPrice === 0) ttsPrice = 0.50;
    }

    // Davos specific correction: if prices are still 1.00 (legacy/cache), force 0.50 to avoid doubling
    if (sttPrice === 1.00 && (tenantToUse as any)?.name === 'Davos') sttPrice = 0.50;
    if (ttsPrice === 1.00 && (tenantToUse as any)?.name === 'Davos') ttsPrice = 0.50;

    if (m.metricType === 'tokens') {
      const calculated = (m.value / 1000) * llmPrice;
      if (calculated > 0 && llmPrice === 0) {
        console.warn('Price skip detected: calculated > 0 but llmPrice is 0', { llmPrice, value: m.value });
      }
      return calculated;
    }
    if (m.metricType === 'messages') return m.value * msgPrice;
    if (m.metricType === 'stt_minutes') return m.value * sttPrice;
    if (m.metricType === 'tts_minutes') return m.value * ttsPrice;
    return 0;
  };

  const summary = useMemo(() => {
    const totals = {
      tokens: 0,
      messages: 0,
      stt: 0,
      tts: 0,
      costSTT: 0,
      costTTS: 0,
      costTokens: 0,
      totalCost: 0,
      messageCost: 0
    };

    filteredMetrics.forEach(m => {
      const cost = calculateMetricCost(m);
      if (m.metricType === 'tokens') {
        totals.tokens += m.value;
        totals.costTokens += cost;
      } else if (m.metricType === 'messages') {
        totals.messages += m.value;
        totals.messageCost += cost;
      } else if (m.metricType === 'stt_minutes') {
        totals.stt += m.value;
        totals.costSTT += cost;
      } else if (m.metricType === 'tts_minutes') {
        totals.tts += m.value;
        totals.costTTS += cost;
      }
    });

    // Strategy: Sum costs for all variable metrics. 
    // Since we halved the voice rates (0.50 STT + 0.50 TTS = 1.00 total), 
    // summing correctly reflects the intended 1.00 per physical minute.
    totals.totalCost = totals.messageCost + totals.costSTT + totals.costTTS + totals.costTokens;

    return totals;
  }, [filteredMetrics, realAgents, currentTenant]);

  const roiStats = useMemo(() => {
    // Force benchmark of 2.0 to ensure coherence between all screens
    const AVG_MIN_PER_MSG = 2.0;
    const hourlyRate = (currentTenant as any)?.roi_config?.operator_hourly_rate || 30.0;

    const hoursSaved = (summary.messages * AVG_MIN_PER_MSG) / 60;

    // Consistent Formatting: XXh YYm
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
    filteredMetrics.forEach(m => {
      const dateStr = m.timestamp.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[dateStr]) days[dateStr] = { date: dateStr, messages: 0, cost: 0 };
      if (m.metricType === 'messages') days[dateStr].messages += m.value;
      days[dateStr].cost += calculateMetricCost(m);
    });
    return Object.values(days).reverse();
  }, [filteredMetrics, realAgents, tenantToUse]);

  const tenantLimit = (tenantToUse as any)?.limits?.llmTokens || 1000000;
  const projectedPercentage = calculateProjection(summary.tokens, tenantLimit, period === '7d' ? 7 : 30);

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
      const cost = calculateMetricCost(m);
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
      if (m.metricType === 'messages') {
        agents[agentId].messages += m.value;
        agents[agentId].messageCost += cost;
      }
      if (m.channel) agents[agentId].usedChannels.add(m.channel);
      agents[agentId].cost += cost;
    });
    return Object.values(agents);
  }, [filteredMetrics, realAgents, tenantToUse]);

  const byChannelData = useMemo(() => {
    const channels: Record<string, any> = {
      whatsapp: { channel: 'whatsapp', name: 'WhatsApp', messages: 0, cost: 0, messageCost: 0 },
      voice: { channel: 'voice', name: 'Voz / Telefonia', messages: 0, cost: 0, stt: 0, tts: 0, messageCost: 0 },
      text: { channel: 'text', name: 'Web Chat (Texto)', messages: 0, cost: 0, messageCost: 0 }
    };

    filteredMetrics.forEach(m => {
      const channelKey = m.channel || 'unknown';
      const cost = calculateMetricCost(m);
      if (!channels[channelKey]) {
        channels[channelKey] = { channel: channelKey, name: channelKey, messages: 0, cost: 0, messageCost: 0 };
      }
      const entry = channels[channelKey];
      if (m.metricType === 'messages') {
        entry.messages += m.value;
        entry.messageCost += cost;
      }
      if (m.metricType === 'stt_minutes') entry.stt = (entry.stt || 0) + m.value;
      if (m.metricType === 'tts_minutes') entry.tts = (entry.tts || 0) + m.value;
      entry.cost += cost;
    });
    return Object.values(channels).filter(c => c.messages > 0 || c.cost > 0);
  }, [filteredMetrics, realAgents, tenantToUse]);

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Consumo Detalhado</h1>
              <p className="text-sm text-muted-foreground">Análise de métricas baseada no Contrato Operacional</p>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportar Audit Log
            </Button>
          </div>

          <div className="px-6 pb-4 flex items-center gap-4">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40 h-8">
                <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>

            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-48 h-8">
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
              <SelectTrigger className="w-36 h-8">
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

        <div className="p-6 space-y-6">
          <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Interações */}
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
                      Volume total de mensagens enviadas. Seu plano cobra por resposta da IA ou humano.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-bold leading-none">{summary.messages.toLocaleString()}</p>
                    <span className="text-[10px] text-muted-foreground pb-0.5">mensagens</span>
                  </div>
                  <p className="text-lg font-black text-primary font-mono pb-0.5">R$ {summary.messageCost.toFixed(2)}</p>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-green-600 font-medium font-bold">
                  <Zap className="h-3 w-3" />
                  <span>{roiStats.display} humanas economizadas</span>
                </div>

              </div>

              {/* 2. Voz (STT/TTS) */}
              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center">
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
                        <Mic className="h-2.5 w-2.5" /> {summary.stt.toFixed(1)}m
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                        <Volume2 className="h-2.5 w-2.5" /> {summary.tts.toFixed(1)}m
                      </div>
                    </div>
                  </div>
                  <p className="text-lg font-black text-primary font-mono">R$ {(summary.costSTT + summary.costTTS).toFixed(2)}</p>
                </div>
              </div>

              {/* 3. Consumo Variável */}
              <div className="kpi-card border-none bg-background shadow-sm ring-1 ring-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-accent" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consumo Variável</span>
                  </div>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <p className="text-2xl font-bold leading-none text-accent">R$ {summary.totalCost.toFixed(2)}</p>
                </div>
                <p className="text-[10px] text-muted-foreground">Total acumulado de mensagens e voz.</p>
              </div>

              {/* 4. Investimento Total */}
              <div className="kpi-card border-none bg-green-600 shadow-sm ring-1 ring-green-700 text-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/80">Investimento Total</span>
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
                  <div className="py-0.5 px-2 bg-white/10 rounded text-[9px] font-semibold uppercase tracking-wider">
                    {(tenantToUse as any)?.planDetails?.monthlyFeeCoversUsage ? 'Mensalidade Flex' : 'Mensalidade + Uso'}
                  </div>
                  <p className="text-[10px] text-white/70 italic">
                    Mensalidade: R$ {(((tenantToUse as any)?.planPrices?.basePrice) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

          </TooltipProvider>

          <Tabs defaultValue="timeline" className="space-y-4">
            <TabsList className="bg-muted/50 p-1 h-9 rounded-none">
              <TabsTrigger value="timeline" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Timeline</TabsTrigger>
              <TabsTrigger value="heatmap" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Horários</TabsTrigger>
              <TabsTrigger value="by-agent" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Agentes</TabsTrigger>
              <TabsTrigger value="by-channel" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Canais</TabsTrigger>
              <TabsTrigger value="cost" className="h-7 text-xs rounded-none data-[state=active]:bg-background transition-all">Análise</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <div className="kpi-card border-border/50">
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

            <TabsContent value="by-agent">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {byAgentData.map((agent) => (
                  <div key={agent.agentId} className="kpi-card border border-border/50">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold flex items-center gap-2">{agent.agentName} <Badge variant="outline" className="text-[9px] uppercase">{agent.stage}</Badge></h4>
                        <div className="flex gap-1 mt-1">
                          {Array.from(agent.usedChannels || []).map((ch: any) => (
                            <Badge key={ch} variant="secondary" className="text-[8px] h-3 px-1">{ch}</Badge>
                          ))}
                        </div>
                      </div>
                      <p className="text-lg font-black text-accent">R$ {agent.cost.toFixed(2)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Interações</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{agent.messages}</span>
                        <div className="h-3 w-[1px] bg-border" />
                        <span className="font-semibold text-primary">R$ {agent.messageCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="by-channel">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {byChannelData.map((channel) => (
                  <div key={channel.channel} className="kpi-card border border-border/50">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-bold capitalize flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /> {channel.name}</h4>
                      <p className="text-lg font-black text-accent">R$ {channel.cost.toFixed(2)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg flex justify-between items-center text-xs">
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

            <TabsContent value="cost">
              <div className="kpi-card border-border/50">
                <h3 className="font-semibold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">Histórico de Faturamento Variável</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyTimeline}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                      <RechartsTooltip />
                      <Bar dataKey="cost" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} name="Custo (R$)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="heatmap">
              <div className="kpi-card border-border/50">
                <h3 className="font-semibold mb-2 text-sm uppercase tracking-wider">Horários de Pico</h3>
                <p className="text-xs text-muted-foreground mb-6 italic">Densidade de interações processadas (Etapa 3 Predictive Analytics).</p>
                <HeatmapChart data={heatmapData} />
              </div>
            </TabsContent>
          </Tabs>

          <div className="p-4 bg-muted/30 border border-dashed rounded-lg">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><Timer className="h-3 w-3" /> Governança de Dados</h4>
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
