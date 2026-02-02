import { MessageSquare, BarChart3, Bell, Clock, Users, TrendingUp, Bot, Zap, CheckCircle2, Workflow } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { KPICard } from '@/components/dashboard/KPICard';
import { mockKPIs, mockAlerts, mockConsumption, mockAgents } from '@/lib/mock-data';
import { mockSuccessMetrics } from '@/lib/mock-extended-data';
import { useApp } from '@/contexts/AppContext';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function Index() {
  const { openSlideOver } = useApp();
  const navigate = useNavigate();

  const consumptionPercentage = (mockConsumption.llmTokens / mockConsumption.planLimit.llmTokens) * 100;

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Visão geral do seu sistema de agentes de IA</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Conversas Ativas"
              value={mockKPIs.activeConversations}
              subtitle="Neste momento"
              icon={MessageSquare}
              variant="accent"
              trend={{ value: 12, isPositive: true }}
              onClick={() => navigate('/conversations')}
            />
            
            <KPICard
              title="Consumo do Plano"
              value={`${consumptionPercentage.toFixed(0)}%`}
              subtitle={`${(mockConsumption.llmTokens / 1000000).toFixed(2)}M de ${(mockConsumption.planLimit.llmTokens / 1000000)}M tokens`}
              icon={BarChart3}
              variant={consumptionPercentage > 80 ? 'critical' : consumptionPercentage > 60 ? 'warning' : 'default'}
              onClick={() => navigate('/consumption')}
            />
            
            <KPICard
              title="Alertas Ativos"
              value={mockKPIs.activeAlerts}
              subtitle="Requerem atenção"
              icon={Bell}
              variant={mockKPIs.activeAlerts > 0 ? 'warning' : 'default'}
              onClick={() => navigate('/alerts')}
            />
            
            <KPICard
              title="Taxa de Sucesso"
              value={`${mockSuccessMetrics.overallSuccessRate}%`}
              subtitle={`${mockSuccessMetrics.successfulConversations.toLocaleString()} resolvidas`}
              icon={CheckCircle2}
              variant="accent"
              trend={{ value: 3.2, isPositive: true }}
              onClick={() => navigate('/flows')}
            />
          </div>

          {/* Success Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Tempo Médio Resolução</span>
              </div>
              <p className="text-2xl font-bold">{(mockSuccessMetrics.avgTimeToResolution / 60).toFixed(1)}min</p>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs">Intervenções Humanas</span>
              </div>
              <p className="text-2xl font-bold">{mockSuccessMetrics.humanInterventions.toLocaleString()}</p>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Workflow className="h-4 w-4" />
                <span className="text-xs">Fluxos Ativos</span>
              </div>
              <p className="text-2xl font-bold">{mockSuccessMetrics.byFlow.length}</p>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">Total Conversas</span>
              </div>
              <p className="text-2xl font-bold">{mockSuccessMetrics.totalConversations.toLocaleString()}</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Usage Over Time */}
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Consumo nos Últimos 30 Dias</h3>
                <Badge variant="secondary">Janeiro 2026</Badge>
              </div>
              <div className="h-64">
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
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Consumption by Agent */}
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Consumo por Agente</h3>
                <button 
                  className="text-sm text-accent hover:underline"
                  onClick={() => navigate('/consumption')}
                >
                  Ver todos
                </button>
              </div>
              <div className="h-64">
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
                      formatter={(value: number) => `${value.toLocaleString()} tokens`}
                    />
                    <Bar dataKey="tokens" fill="hsl(var(--accent))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Active Agents */}
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Agentes Ativos</h3>
                <button 
                  className="text-sm text-accent hover:underline"
                  onClick={() => navigate('/agents')}
                >
                  Gerenciar
                </button>
              </div>
              <div className="space-y-3">
                {mockAgents.filter(a => a.status === 'active').slice(0, 4).map((agent) => (
                  <div 
                    key={agent.id} 
                    className="flex items-center justify-between p-3 bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                    onClick={() => openSlideOver('agent-config', agent)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.activeConversations} ativas</p>
                      </div>
                    </div>
                    <div className="status-dot status-online" />
                  </div>
                ))}
              </div>
            </div>

            {/* Alerts */}
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Alertas Recentes</h3>
                <button 
                  className="text-sm text-accent hover:underline"
                  onClick={() => navigate('/alerts')}
                >
                  Ver todos
                </button>
              </div>
              <div className="space-y-3">
                {mockAlerts.slice(0, 3).map((alert) => (
                  <div 
                    key={alert.id} 
                    className="flex items-start gap-3 p-3 bg-muted"
                  >
                    <div className={`w-2 h-2 mt-1.5 ${
                      alert.type === 'critical' ? 'bg-destructive' :
                      alert.type === 'warning' ? 'bg-warning' : 'bg-info'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{alert.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plan Usage */}
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Uso do Plano</h3>
                <Badge variant="secondary">Enterprise</Badge>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Tokens LLM</span>
                    <span className="text-muted-foreground">
                      {((mockConsumption.llmTokens / mockConsumption.planLimit.llmTokens) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={(mockConsumption.llmTokens / mockConsumption.planLimit.llmTokens) * 100} 
                    className="h-2"
                  />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Mensagens</span>
                    <span className="text-muted-foreground">
                      {((mockConsumption.messagesProcessed / mockConsumption.planLimit.messages) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={(mockConsumption.messagesProcessed / mockConsumption.planLimit.messages) * 100} 
                    className="h-2"
                  />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>STT (minutos)</span>
                    <span className="text-muted-foreground">
                      {((mockConsumption.sttMinutes / mockConsumption.planLimit.sttMinutes) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={(mockConsumption.sttMinutes / mockConsumption.planLimit.sttMinutes) * 100} 
                    className="h-2"
                  />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>TTS (minutos)</span>
                    <span className="text-muted-foreground">
                      {((mockConsumption.ttsMinutes / mockConsumption.planLimit.ttsMinutes) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={(mockConsumption.ttsMinutes / mockConsumption.planLimit.ttsMinutes) * 100} 
                    className="h-2"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
