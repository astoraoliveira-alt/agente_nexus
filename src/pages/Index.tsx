import { MessageSquare, BarChart3, Bell, Clock, Users, TrendingUp, Bot, Zap, CheckCircle2, Workflow } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { KPICard } from '@/components/dashboard/KPICard';
import { useApp } from '@/contexts/AppContext';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function Index() {
  const { currentTenant, openSlideOver } = useApp();
  const navigate = useNavigate();

  // 1. Fetch Data
  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations', currentTenant?.id],
    queryFn: () => currentTenant ? api.getConversations(currentTenant.id) : Promise.resolve([]),
    enabled: !!currentTenant,
    refetchInterval: 10000,
  });

  const { data: consumption, isLoading: loadingConsumption } = useQuery({
    queryKey: ['consumption', currentTenant?.id],
    queryFn: () => currentTenant ? api.getConsumptionMetrics(currentTenant.id, 30) : Promise.resolve([]),
    enabled: !!currentTenant,
  });

  const { data: agents, isLoading: loadingAgents } = useQuery({
    queryKey: ['agents', currentTenant?.id],
    queryFn: () => currentTenant ? api.getAgents(currentTenant.id) : Promise.resolve([]),
    enabled: !!currentTenant,
  });

  const { data: incidents, isLoading: loadingIncidents } = useQuery({
    queryKey: ['incidents', currentTenant?.id],
    queryFn: () => currentTenant ? api.getIncidents(currentTenant.id) : Promise.resolve([]),
    enabled: !!currentTenant,
  });

  const { data: evaluations, isLoading: loadingEvaluations } = useQuery({
    queryKey: ['evaluations', currentTenant?.id],
    queryFn: () => currentTenant ? api.getEvaluations(currentTenant.id) : Promise.resolve([]),
    enabled: !!currentTenant,
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['users', currentTenant?.id],
    queryFn: () => currentTenant ? api.getUsers(currentTenant.id) : Promise.resolve([]),
    enabled: !!currentTenant,
  });

  const { data: contacts, isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts', currentTenant?.id],
    queryFn: () => currentTenant ? api.getContacts(currentTenant.id) : Promise.resolve([]),
    enabled: !!currentTenant,
  });

  const isLoading = loadingConvs || loadingConsumption || loadingAgents || loadingIncidents || loadingEvaluations || loadingUsers || loadingContacts;

  // 2. Calculate KPIs
  const activeConversations = conversations?.filter(c => c.status !== 'closed').length || 0;
  const totalConversations = conversations?.length || 0;
  const activeAlerts = incidents?.filter(i => i.status !== 'resolved').length || 0;

  // AI Trust Score
  const avgTrustScoreNumeric = evaluations && evaluations.length > 0
    ? evaluations.reduce((acc, e) => acc + e.score, 0) / evaluations.length
    : 0;
  const avgTrustScore = avgTrustScoreNumeric.toFixed(1);

  const trustHealth = avgTrustScoreNumeric >= 80 ? { label: 'Bom', variant: 'success' as const } :
    avgTrustScoreNumeric >= 50 ? { label: 'Regular', variant: 'warning' as const } :
      { label: 'Ruim', variant: 'critical' as const };

  // Consumption Logic
  const limits = currentTenant?.limits || { llmTokens: 0, messages: 0, sttMinutes: 0, ttsMinutes: 0, agents: 0, users: 0 };
  const totalTokens = consumption?.filter(m => m.metricType === 'tokens').reduce((acc, m) => acc + m.value, 0) || 0;
  const consumptionLimit = (limits.llmTokens as number) || 1; // Avoid division by zero
  const consumptionPercentage = (totalTokens / consumptionLimit) * 100;

  const totalMessages = consumption?.filter(m => m.metricType === 'messages').reduce((acc, m) => acc + m.value, 0) || 0;
  const messageLimit = (limits.messages as number) || 1;
  const messageUsagePct = (totalMessages / messageLimit) * 100;

  // Success Rate & Resolution Time
  const closedConvs = conversations?.filter(c => c.status === 'closed') || [];
  const successfulConvs = closedConvs.filter(c => {
    // A conversation is successful if it's closed and has no critical incident linked
    const hasCriticalIncident = incidents?.some(i => i.conversationId === c.id && i.severity === 'critical');
    return !hasCriticalIncident;
  });
  const successRate = closedConvs.length > 0 ? ((successfulConvs.length / closedConvs.length) * 100).toFixed(1) : '100';

  const avgResTimeSeconds = closedConvs.length > 0
    ? closedConvs.reduce((acc, c) => {
      const start = new Date(c.createdAt).getTime();
      const end = new Date(c.lastMessageTime).getTime();
      if (isNaN(start) || isNaN(end)) return acc;
      return acc + Math.max(0, end - start);
    }, 0) / (closedConvs.length * 1000)
    : 0;
  const avgResTimeMin = (avgResTimeSeconds / 60).toFixed(1);

  const humanInterventions = conversations?.filter(c => c.assignedOperator || c.status === 'human_active').length || 0;

  // Incident Metrics
  const incidentsAbertos = incidents?.filter(i => i.status === 'open').length || 0;
  const incidentsInvestigando = incidents?.filter(i => i.status === 'investigating').length || 0;
  const incidentsResolvidos = incidents?.filter(i => i.status === 'resolved').length || 0;
  const totalIncidents = incidents?.length || 0;

  // Contact Metrics
  const totalContacts = contacts?.length || 0;
  const lastWeek = subDays(new Date(), 7);
  const newContactsThisWeek = contacts?.filter(c => new Date(c.createdAt) >= lastWeek).length || 0;

  const leadQuenteCount = contacts?.filter(c => ['Lead Quente', 'sql', 'SQL'].includes(c.lifecycleStatus || '')).length || 0;
  const interesseMedioCount = contacts?.filter(c => ['Interesse Médio', 'mql', 'MQL'].includes(c.lifecycleStatus || '')).length || 0;
  const interesseBaixoCount = contacts?.filter(c => (['Interesse Baixo', 'lead', 'Lead'].includes(c.lifecycleStatus || '') || !c.lifecycleStatus)).length || 0;

  // 3. Prepare Chart Data
  // Daily Usage (Last 30 days)
  const last30Days = eachDayOfInterval({
    start: subDays(new Date(), 29),
    end: new Date(),
  });

  const dailyUsageData = last30Days.map(date => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayTokens = consumption?.filter(m =>
      m.metricType === 'tokens' && format(new Date(m.timestamp), 'yyyy-MM-dd') === dateStr
    ).reduce((acc, m) => acc + m.value, 0) || 0;

    return {
      date: format(date, 'dd/MM'),
      tokens: dayTokens,
    };
  });

  // Consumption by Agent
  const consumptionByAgent = agents?.map(agent => {
    const agentTokens = consumption?.filter(m => m.agentId === agent.id && m.metricType === 'tokens')
      .reduce((acc, m) => acc + m.value, 0) || 0;
    return {
      agentName: agent.name,
      tokens: agentTokens,
    };
  }).sort((a, b) => b.tokens - a.tokens).slice(0, 5) || [];

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </MainLayout>
    );
  }

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
              value={activeConversations}
              subtitle="Neste momento"
              icon={MessageSquare}
              variant="accent"
              trend={{ value: 0, isPositive: true }}
              onClick={() => navigate('/conversations')}
            />

            <KPICard
              title="Consumo do Plano"
              value={consumptionPercentage > 100
                ? `Excedido ${(consumptionPercentage - 100).toFixed(0)}%`
                : `${consumptionPercentage.toFixed(0)}%`
              }
              subtitle={`${(totalTokens / 1000).toFixed(0)}k de ${consumptionLimit >= 1000000 ? `${(consumptionLimit / 1000000).toFixed(0)}M` : `${(consumptionLimit / 1000).toFixed(0)}k`} tokens`}
              icon={BarChart3}
              variant={consumptionPercentage > 100 ? 'critical' : consumptionPercentage > 80 ? 'warning' : 'default'}
              onClick={() => navigate('/consumption')}
            />

            <KPICard
              title="AI Trust Score (Média)"
              value={avgTrustScore}
              subtitle={`Saúde: ${trustHealth.label} (${evaluations?.length || 0} auditorias)`}
              icon={Zap}
              variant={trustHealth.variant}
              onClick={() => navigate('/quality')}
            />

            <KPICard
              title="Taxa de Sucesso"
              value={`${successRate}%`}
              subtitle={`${successfulConvs.length.toLocaleString()} resolvidas`}
              icon={CheckCircle2}
              variant="accent"
              trend={{ value: 0, isPositive: true }}
              onClick={() => navigate('/quality')}
            />
          </div>

          {/* Detailed Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="kpi-card flex flex-col justify-between cursor-pointer hover:border-destructive/50 transition-all group" onClick={() => navigate('/alerts')}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bell className="h-4 w-4 text-warning" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Gestão de Incidentes</span>
                  </div>
                  <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/5">Total: {totalIncidents}</Badge>
                </div>

                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-bold text-destructive">{incidentsAbertos + incidentsInvestigando}</p>
                  <span className="text-sm text-muted-foreground">Pendentes</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Abertos</span>
                      <span className="font-bold text-destructive">{incidentsAbertos}</span>
                    </div>
                    <Progress value={(incidentsAbertos / (totalIncidents || 1)) * 100} className="h-1 bg-destructive/10 [&>div]:bg-destructive" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Análise</span>
                      <span className="font-bold text-warning">{incidentsInvestigando}</span>
                    </div>
                    <Progress value={(incidentsInvestigando / (totalIncidents || 1)) * 100} className="h-1 bg-warning/10 [&>div]:bg-warning" />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Resolvidos</span>
                      <span className="font-bold text-success">{incidentsResolvidos}</span>
                    </div>
                    <Progress value={(incidentsResolvidos / (totalIncidents || 1)) * 100} className="h-1 bg-success/10 [&>div]:bg-success" />
                  </div>
                </div>
              </div>
            </div>

            <div className="kpi-card flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Usuários Cadastrados</span>
                </div>
                <p className="text-4xl font-bold text-primary">{users?.length || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Colaboradores vinculados à empresa</p>
              </div>
            </div>

            <div className="kpi-card flex flex-col justify-between cursor-pointer hover:border-accent/50 transition-all group" onClick={() => navigate('/contacts')}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="h-4 w-4 text-accent" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Base de Contatos</span>
                  </div>
                  <Badge variant="outline" className="text-success border-success/20 bg-success/5">+{newContactsThisWeek} sem</Badge>
                </div>

                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-bold text-accent">{totalContacts}</p>
                  <span className="text-sm text-muted-foreground">Contatos</span>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <span className="text-muted-foreground">Quentes</span>
                    </div>
                    <span className="font-bold">{leadQuenteCount}</span>
                  </div>
                  <Progress value={(leadQuenteCount / (totalContacts || 1)) * 100} className="h-1 bg-orange-500/10 [&>div]:bg-orange-500" />

                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className="text-muted-foreground">Médio</span>
                    </div>
                    <span className="font-bold">{interesseMedioCount}</span>
                  </div>
                  <Progress value={(interesseMedioCount / (totalContacts || 1)) * 100} className="h-1 bg-blue-500/10 [&>div]:bg-blue-500" />
                </div>
              </div>
            </div>

            <div className="kpi-card flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Tempo Médio Resolução</span>
                </div>
                <p className="text-4xl font-bold">{avgResTimeMin}min</p>
                <p className="text-xs text-muted-foreground mt-1">Média de conversas finalizadas</p>
              </div>
            </div>
          </div>

          {/* Legacy General Metrics Row (Consolidated) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Bot className="h-4 w-4" />
                <span className="text-xs">Intervenções Humanas</span>
              </div>
              <p className="text-2xl font-bold">{humanInterventions.toLocaleString()}</p>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Workflow className="h-4 w-4" />
                <span className="text-xs">Agentes em Produção</span>
              </div>
              <p className="text-2xl font-bold">{agents?.filter(a => a.lifecycleStage === 'production').length || 0}</p>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">Total Conversas (Mês)</span>
              </div>
              <p className="text-2xl font-bold">{totalConversations.toLocaleString()}</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Usage Over Time */}
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Consumo nos Últimos 30 Dias (Tokens)</h3>
                <Badge variant="secondary">{format(new Date(), 'MMMM yyyy', { locale: ptBR })}</Badge>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyUsageData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
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
                  <BarChart data={consumptionByAgent} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                    />
                    <YAxis
                      type="category"
                      dataKey="agentName"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      width={100}
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
                {agents?.filter(a => a.status === 'active').slice(0, 4).map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                    onClick={() => openSlideOver('agent-config', agent)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.activeConversations} ativas</p>
                      </div>
                    </div>
                    <div className={`status-dot ${agent.status === 'active' ? 'status-online' : 'status-offline'}`} />
                  </div>
                ))}
                {(!agents || agents.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum agente ativo</p>
                )}
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
                {incidents?.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 p-3 bg-muted"
                  >
                    <div className={`w-2 h-2 mt-1.5 flex-shrink-0 ${alert.severity === 'critical' ? 'bg-destructive' :
                      alert.severity === 'high' ? 'bg-orange-500' :
                        alert.severity === 'medium' ? 'bg-warning' : 'bg-info'
                      }`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{alert.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{alert.description}</p>
                    </div>
                  </div>
                ))}
                {(!incidents || incidents.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum alerta recente</p>
                )}
              </div>
            </div>

            {/* Plan Usage */}
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Uso do Plano</h3>
                <Badge variant="secondary" className="capitalize">{currentTenant?.plan || 'Flex'}</Badge>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Tokens LLM</span>
                    <span className={cn(
                      "font-medium",
                      consumptionPercentage > 100 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {consumptionPercentage > 100
                        ? `Excedido ${(consumptionPercentage - 100).toFixed(0)}%`
                        : `${consumptionPercentage.toFixed(0)}%`
                      }
                    </span>
                  </div>
                  <Progress
                    value={Math.min(consumptionPercentage, 100)}
                    className={cn(
                      "h-2",
                      consumptionPercentage > 100 && "[&>div]:bg-destructive"
                    )}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Mensagens</span>
                    <span className={cn(
                      "font-medium",
                      messageUsagePct > 100 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {messageUsagePct > 100
                        ? `Excedido ${(messageUsagePct - 100).toFixed(0)}%`
                        : `${messageUsagePct.toFixed(0)}%`
                      }
                    </span>
                  </div>
                  <Progress
                    value={Math.min(messageUsagePct, 100)}
                    className={cn(
                      "h-2",
                      messageUsagePct > 100 && "[&>div]:bg-destructive"
                    )}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Voz (STT/TTS)</span>
                    <span className="text-muted-foreground">
                      {Math.min(((consumption?.filter(m => m.metricType.includes('ts')).reduce((acc, m) => acc + m.value, 0) || 0) / (limits.sttMinutes || 1)) * 100, 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(((consumption?.filter(m => m.metricType.includes('ts')).reduce((acc, m) => acc + m.value, 0) || 0) / (limits.sttMinutes || 1)) * 100, 100)}
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
