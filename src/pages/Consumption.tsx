import { useState, useMemo } from 'react';
import { Cpu, MessageSquare, Mic, Volume2, DollarSign, TrendingUp, Filter, Download, Calendar } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockAgents, mockTenants } from '@/lib/mock-data';
import { mockConsumptionMetrics, mockPeakUsageMatrix } from '@/lib/mock-extended-data';
import { calculateProjection, isMetricBillable } from '@/lib/consumption-logic';
import { useApp } from '@/contexts/AppContext';
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
  const { openSlideOver } = useApp();
  const [period, setPeriod] = useState('30d');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  // Unified Metrics Calculation (Etapa 1 & 6)
  const filteredMetrics = useMemo(() => {
    let data = [...mockConsumptionMetrics];
    const now = new Date();

    // Period Filter
    if (period === '7d') data = data.filter(m => (now.getTime() - m.timestamp.getTime()) < 7 * 24 * 60 * 60 * 1000);
    if (period === '30d') data = data.filter(m => (now.getTime() - m.timestamp.getTime()) < 30 * 24 * 60 * 60 * 1000);

    // Agent Filter
    if (agentFilter !== 'all') data = data.filter(m => m.agentId === agentFilter);

    // Channel Filter
    if (channelFilter !== 'all') data = data.filter(m => m.channel === channelFilter);

    return data;
  }, [period, agentFilter, channelFilter]);

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
      // Find agent stage for billable check (Etapa 4)
      const agent = mockAgents.find(a => a.id === m.agentId);
      const isBillable = agent ? isMetricBillable(agent.lifecycleStage) : true;

      const cost = isBillable ? m.cost : 0;

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

      totals.totalCost += cost;
    });

    return totals;
  }, [filteredMetrics]);

  // Daily Aggregation for Timeline (Etapa 2)
  const dailyTimeline = useMemo(() => {
    const days: Record<string, any> = {};
    filteredMetrics.forEach(m => {
      const dateStr = m.timestamp.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[dateStr]) days[dateStr] = { date: dateStr, tokens: 0, messages: 0, cost: 0 };

      if (m.metricType === 'tokens') days[dateStr].tokens += m.value;
      if (m.metricType === 'messages') days[dateStr].messages += m.value;
      days[dateStr].cost += m.cost;
    });
    return Object.values(days).reverse();
  }, [filteredMetrics]);

  const tenantLimit = mockTenants[0]?.plan === 'enterprise' ? 5000000 : 1000000;
  const consumptionPercentage = (summary.tokens / tenantLimit) * 100;
  const projectedPercentage = calculateProjection(summary.tokens, tenantLimit, period === '7d' ? 7 : 30);

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
      if (!m.agentId) return;
      if (!agents[m.agentId]) {
        const agentInfo = mockAgents.find(a => a.id === m.agentId);
        agents[m.agentId] = {
          agentId: m.agentId,
          agentName: agentInfo?.name || 'Sistema',
          tokens: 0,
          messages: 0,
          cost: 0,
          stage: agentInfo?.lifecycleStage || 'production'
        };
      }
      if (m.metricType === 'tokens') agents[m.agentId].tokens += m.value;
      if (m.metricType === 'messages') agents[m.agentId].messages += m.value;
      if (isMetricBillable(agents[m.agentId].stage)) {
        agents[m.agentId].cost += m.cost;
      }
    });
    return Object.values(agents);
  }, [filteredMetrics]);

  const byChannelData = useMemo(() => {
    const channels: Record<string, any> = {
      whatsapp: { channel: 'whatsapp', name: 'WhatsApp', tokens: 0, messages: 0, cost: 0 },
      voice: { channel: 'voice', name: 'Voz', tokens: 0, messages: 0, cost: 0, stt: 0, tts: 0 },
      text: { channel: 'text', name: 'Web Chat', tokens: 0, messages: 0, cost: 0 }
    };

    filteredMetrics.forEach(m => {
      if (!channels[m.channel]) return;
      if (m.metricType === 'tokens') channels[m.channel].tokens += m.value;
      if (m.metricType === 'messages') channels[m.channel].messages += m.value;
      if (m.metricType === 'stt_minutes') channels[m.channel].stt += m.value;
      if (m.metricType === 'tts_minutes') channels[m.channel].tts += m.value;
      channels[m.channel].cost += m.cost;
    });

    return Object.values(channels).filter(c => c.messages > 0 || c.cost > 0);
  }, [filteredMetrics]);

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
                  {mockAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} ({agent.lifecycleStage})
                    </SelectItem>
                  ))}
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
              <p className="text-2xl font-bold mb-2">{(summary.tokens / 1000000).toFixed(2)}M</p>
              <Progress value={consumptionPercentage} className="h-1 mb-1" />
              <p className="text-xs text-muted-foreground">{consumptionPercentage.toFixed(0)}% do contrato</p>
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

          {/* Alerts & Projections (Etapa 2) */}
          <div className={`kpi-card border-l-4 ${projectedPercentage > 100 ? 'border-l-destructive bg-destructive/5' : projectedPercentage > 80 ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-primary bg-primary/5'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className={`h-5 w-5 ${projectedPercentage > 80 ? 'text-destructive' : 'text-primary'}`} />
                <div>
                  <p className="font-medium">Projeção de Fim de Ciclo</p>
                  <p className="text-sm text-muted-foreground">Estimativa baseada na média móvel de {period === '7d' ? '7' : '30'} dias.</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${projectedPercentage > 80 ? 'text-destructive' : ''}`}>{projectedPercentage.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">da cota mensal</p>
              </div>
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
                        <h4 className="font-bold">{agent.agentName}</h4>
                        <Badge variant="outline" className="text-[10px] uppercase">{agent.stage}</Badge>
                      </div>
                      <p className="text-lg font-bold">R$ {agent.cost.toFixed(2)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-muted rounded">
                        <p className="text-muted-foreground">Tokens</p>
                        <p className="font-mono">{(agent.tokens / 1000).toFixed(1)}k</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <p className="text-muted-foreground">Mensagens</p>
                        <p className="font-mono">{agent.messages}</p>
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {byChannelData.map((channel) => (
                  <div key={channel.channel} className="kpi-card">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-primary" />
                      </div>
                      <h4 className="font-bold capitalize">{channel.name}</h4>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mensagens</span>
                        <span>{channel.messages}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Custo Total</span>
                        <span className="font-bold">R$ {channel.cost.toFixed(2)}</span>
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
