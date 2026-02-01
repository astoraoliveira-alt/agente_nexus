import { useState, useMemo } from 'react';
import { Cpu, MessageSquare, Mic, Volume2, DollarSign, TrendingUp, Filter, Download, Calendar } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockConsumption, mockAgents } from '@/lib/mock-data';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeatmapChart, generateMockHeatmapData } from '@/components/consumption/HeatmapChart';
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
} from 'recharts';

const COLORS = ['hsl(192, 91%, 36%)', 'hsl(222, 47%, 35%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)'];

export default function Consumption() {
  const { openSlideOver } = useApp();
  const [period, setPeriod] = useState('30d');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const consumptionPercentage = (mockConsumption.llmTokens / mockConsumption.planLimit.llmTokens) * 100;
  const projectedUsage = (consumptionPercentage / 20) * 30; // Simple projection based on 20 days elapsed

  const heatmapData = useMemo(() => generateMockHeatmapData(), []);

  const pieData = [
    { name: 'LLM', value: mockConsumption.costBreakdown.llm },
    { name: 'STT', value: mockConsumption.costBreakdown.stt },
    { name: 'TTS', value: mockConsumption.costBreakdown.tts },
  ];

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Consumo Detalhado</h1>
                <p className="text-sm text-muted-foreground">Análise completa de utilização e custos</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
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
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
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
                      {agent.name}
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
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="voice">Voz</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Mais Filtros
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div 
              className="kpi-card border-l-4 border-l-accent cursor-pointer"
              onClick={() => openSlideOver('consumption-details', { type: 'metric', title: 'Tokens LLM', details: { tokens: mockConsumption.llmTokens } })}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                  <Cpu className="h-5 w-5 text-accent" />
                </div>
                <span className="text-sm text-muted-foreground">Tokens LLM</span>
              </div>
              <p className="text-2xl font-bold mb-2">{(mockConsumption.llmTokens / 1000000).toFixed(2)}M</p>
              <div>
                <Progress value={consumptionPercentage} className="h-1 mb-1" />
                <p className="text-xs text-muted-foreground">{consumptionPercentage.toFixed(0)}% do limite</p>
              </div>
            </div>

            <div 
              className="kpi-card cursor-pointer"
              onClick={() => openSlideOver('consumption-details', { type: 'metric', title: 'Mensagens', details: { messages: mockConsumption.messagesProcessed } })}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <span className="text-sm text-muted-foreground">Mensagens</span>
              </div>
              <p className="text-2xl font-bold mb-2">{mockConsumption.messagesProcessed.toLocaleString()}</p>
              <div>
                <Progress value={(mockConsumption.messagesProcessed / mockConsumption.planLimit.messages) * 100} className="h-1 mb-1" />
                <p className="text-xs text-muted-foreground">{((mockConsumption.messagesProcessed / mockConsumption.planLimit.messages) * 100).toFixed(0)}% do limite</p>
              </div>
            </div>

            <div className="kpi-card cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Mic className="h-5 w-5" />
                </div>
                <span className="text-sm text-muted-foreground">STT (minutos)</span>
              </div>
              <p className="text-2xl font-bold mb-2">{mockConsumption.sttMinutes.toLocaleString()}</p>
              <div>
                <Progress value={(mockConsumption.sttMinutes / mockConsumption.planLimit.sttMinutes) * 100} className="h-1 mb-1" />
                <p className="text-xs text-muted-foreground">{((mockConsumption.sttMinutes / mockConsumption.planLimit.sttMinutes) * 100).toFixed(0)}% do limite</p>
              </div>
            </div>

            <div className="kpi-card cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Volume2 className="h-5 w-5" />
                </div>
                <span className="text-sm text-muted-foreground">TTS (minutos)</span>
              </div>
              <p className="text-2xl font-bold mb-2">{mockConsumption.ttsMinutes.toLocaleString()}</p>
              <div>
                <Progress value={(mockConsumption.ttsMinutes / mockConsumption.planLimit.ttsMinutes) * 100} className="h-1 mb-1" />
                <p className="text-xs text-muted-foreground">{((mockConsumption.ttsMinutes / mockConsumption.planLimit.ttsMinutes) * 100).toFixed(0)}% do limite</p>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {(consumptionPercentage > 50 || projectedUsage > 100) && (
            <div className={`kpi-card border-l-4 ${projectedUsage > 100 ? 'border-l-destructive bg-destructive/5' : 'border-l-warning bg-warning/5'}`}>
              <div className="flex items-center gap-3">
                <TrendingUp className={`h-5 w-5 ${projectedUsage > 100 ? 'text-destructive' : 'text-warning'}`} />
                <div>
                  <p className="font-medium">
                    {projectedUsage > 100 
                      ? 'Projeção indica excesso de consumo'
                      : 'Consumo acima de 50% do limite'
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Projeção para o fim do ciclo: {projectedUsage.toFixed(0)}% do limite
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs for different views */}
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
                <h3 className="font-semibold mb-4">Consumo de Tokens ao Longo do Tempo</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mockConsumption.dailyUsage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickLine={false}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="tokens" 
                        stroke="hsl(var(--accent))" 
                        strokeWidth={2}
                        dot={false}
                        name="Tokens"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="messages" 
                        stroke="hsl(var(--chart-2))" 
                        strokeWidth={2}
                        dot={false}
                        name="Mensagens"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="heatmap" className="space-y-4">
              <div className="kpi-card">
                <HeatmapChart data={heatmapData} title="Distribuição de Conversas por Horário" />
                <p className="text-sm text-muted-foreground mt-4">
                  Visualize os horários com maior volume de conversas para otimizar a alocação de recursos.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="by-agent" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="kpi-card">
                  <h3 className="font-semibold mb-4">Consumo por Agente</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mockConsumption.byAgent} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          type="number" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          tickLine={false}
                          tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                        />
                        <YAxis 
                          type="category" 
                          dataKey="agentName" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          tickLine={false}
                          width={120}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '0',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Bar dataKey="tokens" fill="hsl(var(--accent))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="kpi-card">
                  <h3 className="font-semibold mb-4">Detalhamento por Agente</h3>
                  <div className="space-y-4">
                    {mockConsumption.byAgent.map((agent, index) => (
                      <div 
                        key={agent.agentId}
                        className="p-4 bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                        onClick={() => openSlideOver('consumption-details', { 
                          type: 'agent', 
                          title: agent.agentName, 
                          details: agent 
                        })}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{agent.agentName}</span>
                          <Badge variant="secondary">R$ {agent.cost.toFixed(2)}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Tokens:</span>
                            <span className="ml-2 font-medium">{(agent.tokens / 1000000).toFixed(2)}M</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Mensagens:</span>
                            <span className="ml-2 font-medium">{agent.messages.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="by-channel" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {mockConsumption.byChannel.map((channel) => (
                  <div 
                    key={channel.channel}
                    className="kpi-card cursor-pointer"
                    onClick={() => openSlideOver('consumption-details', { 
                      type: 'channel', 
                      title: channel.channel === 'text' ? 'Canal Texto' : 'Canal Voz', 
                      details: channel 
                    })}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-accent/10 flex items-center justify-center">
                          {channel.channel === 'text' ? (
                            <MessageSquare className="h-6 w-6 text-accent" />
                          ) : (
                            <Mic className="h-6 w-6 text-accent" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold text-lg capitalize">
                            {channel.channel === 'text' ? 'Texto' : 'Voz'}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {channel.messages.toLocaleString()} mensagens
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-lg px-3 py-1">
                        R$ {channel.cost.toFixed(2)}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-muted">
                        <p className="text-2xl font-bold">{(channel.tokens / 1000000).toFixed(2)}M</p>
                        <p className="text-xs text-muted-foreground">Tokens</p>
                      </div>
                      <div className="p-3 bg-muted">
                        <p className="text-2xl font-bold">{channel.messages.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Mensagens</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="cost" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Cost Summary */}
                <div className="kpi-card lg:col-span-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Custo Total</p>
                      <p className="text-3xl font-bold">R$ {mockConsumption.costBreakdown.total.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">LLM</span>
                      <span className="font-medium">R$ {mockConsumption.costBreakdown.llm.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">STT</span>
                      <span className="font-medium">R$ {mockConsumption.costBreakdown.stt.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">TTS</span>
                      <span className="font-medium">R$ {mockConsumption.costBreakdown.tts.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Cost Distribution Pie */}
                <div className="kpi-card lg:col-span-2">
                  <h3 className="font-semibold mb-4">Distribuição de Custos</h3>
                  <div className="h-64 flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '0',
                          }}
                          formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {pieData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <div className="w-3 h-3" style={{ backgroundColor: COLORS[index] }} />
                          <span className="text-sm">{entry.name}</span>
                          <span className="text-sm font-medium">R$ {entry.value.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Over Time */}
              <div className="kpi-card">
                <h3 className="font-semibold mb-4">Custo Diário</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockConsumption.dailyUsage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickLine={false}
                        tickFormatter={(value) => `R$${value}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                      />
                      <Bar dataKey="cost" fill="hsl(var(--accent))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
