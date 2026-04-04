import { MessageSquare, BarChart3, Bell, Clock, Users, TrendingUp, Bot, Zap } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { KPICard } from '@/components/dashboard/KPICard';
import { EdenredConversionBanner } from '@/components/dashboard/EdenredConversionBanner';
import { useApp } from '@/contexts/AppContext';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { dashboardService } from '@/services/dashboard.service';
import { cn } from '@/lib/utils';
import { TooltipProvider } from "@/components/ui/tooltip";

const EDENRED_TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

export default function Index() {
  const { currentTenant, openSlideOver } = useApp();
  const navigate = useNavigate();

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['dashboard-stats', currentTenant?.id],
    queryFn: () => api.getDashMaster(currentTenant!.id),
    enabled: !!currentTenant?.id,
    refetchInterval: 60000,
  });

  // Edenred-specific conversion query
  const isEdenred = currentTenant?.id === EDENRED_TENANT_ID;
  const { data: edenredFunnel, isLoading: isLoadingEdenred } = useQuery({
    queryKey: ['edenred-conversion', currentTenant?.id],
    queryFn: () => dashboardService.getEdenredConversionFunnel(currentTenant!.id),
    enabled: isEdenred,
    refetchInterval: 60000,
  });

  // Default structure to prevent Uncaught TypeError
  const defaultRoi = { minsPerMsg: 2, operatorHourRate: 30 };
  const summary = dashData?.summary || { 
    activeConversations: 0, 
    automationRate: 100, 
    avgTrustScore: 0, 
    totalEvaluations: 0,
    roiCriteria: defaultRoi 
  };
  
  // Extra layer of safety for cases where dashData exists but without roiCriteria
  const roiCriteria = summary.roiCriteria || defaultRoi;

  const usage = dashData?.usage || { totalMessages: 0 };
  const financials = dashData?.financials || { displaySavedTime: '0m', totalMoneySaved: 0 };
  const plan = dashData?.plan || { name: 'Flex', limits: { messages: 1000 } };
  const incidents = dashData?.incidents || { total: 0, open: 0, investigating: 0, resolved: 0 };
  const contacts = dashData?.contacts || { total: 0, hot: 0, warm: 0, cold: 0 };
  const agents = dashData?.agents || [];
  const dailyUsageData = dashData?.charts?.dailyMessages || [];

  const messageUsagePct = (usage.totalMessages / (plan.limits.messages || 1)) * 100;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-pulse text-background">.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto bg-[#F8FAFC]">
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 pb-12">
          
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-tight text-[#0F172A]">Dashboard</h1>
            <p className="text-muted-foreground font-medium">Visão consolidada da operação de IA</p>
          </div>

          <TooltipProvider delayDuration={200}>
            {/* Row 1: KPIs */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <KPICard 
                title="Conversas Ativas" 
                value={summary.activeConversations} 
                description="Volume em tempo real" 
                icon={MessageSquare}
                helpText="Número de conversas que estão em andamento neste momento (status diferente de 'closed'). Inclui atendimentos por IA e por operadores humanos."
              />
              <KPICard 
                title="Taxa de Automação" 
                value={`${summary.automationRate}%`} 
                description="Sem intervenção humana" 
                icon={Zap}
                helpText="Percentual de conversas resolvidas 100% pela IA, sem necessidade de transferência para um operador humano. Fórmula: (Total de Conversas − Handoffs Humanos) ÷ Total de Conversas × 100."
              />

              <KPICard 
                title="Economia Estimada" 
                value={financials.displaySavedTime} 
                description={`R$ ${financials.totalMoneySaved.toLocaleString('pt-BR')}`} 
                icon={Clock} 
                variant="success"
                helpText={`Tempo e dinheiro economizados com automação nos últimos 30 dias.\n\n• Cada interação automatizada economiza ~${roiCriteria.minsPerMsg} min de um operador humano.\n• Custo/hora do operador: R$ ${roiCriteria.operatorHourRate}/h.\n• Fórmula: (Mensagens × ${roiCriteria.minsPerMsg} min) ÷ 60 × R$ ${roiCriteria.operatorHourRate}.`}
              />

              <KPICard 
                title="Quota de Mensagens" 
                value={`${messageUsagePct.toFixed(0)}%`} 
                description={`${usage.totalMessages.toLocaleString()} / ${(plan.limits?.messages || 0).toLocaleString()}`} 
                icon={BarChart3} 
                variant={messageUsagePct > 90 ? 'danger' : 'default'}
                helpText={`Percentual de mensagens consumidas em relação ao limite do seu plano (${plan.name}).\n\n• Consumo atual: ${usage.totalMessages.toLocaleString()} mensagens.\n• Limite do plano: ${(plan.limits?.messages || 0).toLocaleString()} mensagens.\n• Contabiliza mensagens reais trocadas nos últimos 30 dias.`}
              />
            </div>
          </TooltipProvider>

          {/* Edenred Specific Conversion Funnel Banner */}
          {isEdenred && edenredFunnel && (
            <div className="w-full">
              <EdenredConversionBanner 
                totalContacts={edenredFunnel.total_contacts}
                linkSentContacts={edenredFunnel.link_sent_contacts}
                conversionRate={edenredFunnel.conversion_rate}
                isLoading={isLoadingEdenred}
              />
            </div>
          )}

          {/* Row 2: Operation Blocks */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500"><Bell className="h-4 w-4" /></div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Gestão de Incidentes</h3>
                </div>
                <Badge variant="outline" className="text-red-500 border-red-500/20 font-bold">Total: {incidents.total}</Badge>
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <div className="text-center py-4">
                  <p className="text-5xl font-black text-red-500 tracking-tighter">{incidents.open}</p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mt-1">Pendentes</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Análise</p>
                    <p className="font-bold">{incidents.investigating}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Resolvidos</p>
                    <p className="font-bold">{incidents.resolved}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm flex flex-col items-center">
              <div className="flex items-center justify-between w-full mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Trust Score</h3>
                <Badge className={cn(summary.avgTrustScore >= 7.5 ? "bg-emerald-500" : "bg-rose-500")}>SAÚDE</Badge>
              </div>
              <div className="relative mb-4">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/10" />
                  <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={351.8} strokeDashoffset={351.8 - (351.8 * summary.avgTrustScore) / 10} className={cn("transition-all duration-1000", summary.avgTrustScore >= 7.5 ? "text-emerald-500" : "text-rose-500")} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black">{summary.avgTrustScore.toFixed(1)}</span>
                  <span className="text-[8px] uppercase font-bold text-muted-foreground">Global</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground italic">Baseado em {summary.totalEvaluations} auditorias</p>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Performance Agentes</h3>
                <button onClick={() => navigate('/agents')} className="text-[10px] font-bold text-accent uppercase hover:underline">Ver Todos</button>
              </div>
              <div className="space-y-4">
                {agents.slice(0, 3).map((agent: any) => (
                  <div key={agent.id} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{agent.name}</p>
                        <p className="text-[10px] text-muted-foreground">{agent.totalConversations || 0} conversas</p>
                      </div>
                      <div className="text-right flex items-end gap-3">
                        <div>
                          <p className="text-[11px] font-bold text-primary">~{agent.avgMsgsPerUser || 0}</p>
                          <p className="text-[7px] font-black text-muted-foreground uppercase">Msgs/Usuário</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-accent">{(agent.usage?.totalMessages || 0).toLocaleString()}</p>
                          <p className="text-[7px] font-black text-muted-foreground uppercase">Mensagens</p>
                        </div>
                      </div>
                    </div>
                    <Progress value={Math.min(((agent.usage?.totalMessages || 0) / (agents[0]?.usage?.totalMessages || 1)) * 100, 100)} className="h-1 shadow-inner" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Charts and Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80 mb-6 font-sans">Fluxo de Mensagens (Consolidado)</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyUsageData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="messages" stroke="#3B82F6" strokeWidth={3} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 text-slate-800">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Funil de Leads</h3>
                <button onClick={() => navigate('/contacts')} className="text-[10px] font-bold text-accent uppercase hover:underline">CRM</button>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'SQL (Quentes)', val: contacts.hot, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                  { label: 'MQL (Interesse)', val: contacts.warm, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                  { label: 'Novos / Frios', val: contacts.cold, color: 'text-blue-500', bg: 'bg-blue-500/10' }
                ].map((item, i) => (
                  <div key={i} className="p-4 rounded-xl border border-border/50 flex justify-between items-center group hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 font-sans">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-[10px]", item.bg, item.color)}>
                        {item.label.split(' ')[0]}
                      </div>
                      <span className="text-xs font-bold text-slate-600">{item.label}</span>
                    </div>
                    <span className="text-2xl font-black text-slate-900">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-bold mb-4 uppercase tracking-wider text-muted-foreground/80 font-sans">Monitor de Status</h3>
              <div className="space-y-3">
                {agents?.slice(0, 4).map((agent: any) => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-muted/20 border border-border/50 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => openSlideOver('agent-config', agent)}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-accent/10 rounded flex items-center justify-center text-accent"><Bot className="h-4 w-4" /></div>
                      <div>
                        <p className="font-bold text-xs">{agent.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase opacity-70 tracking-tighter">{agent.type}</p>
                      </div>
                    </div>
                    <div className={cn("w-2 h-2 rounded-full", agent.status === 'active' ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-bold mb-6 uppercase tracking-wider text-muted-foreground/80 font-sans">Qualidade da Base (%)</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5 uppercase">
                    <span className="text-muted-foreground">Oportunidades Reais</span>
                    <span className="text-slate-900">{((contacts.hot / (contacts.total || 1)) * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={(contacts.hot / (contacts.total || 1)) * 100} className="h-1.5 bg-emerald-500/10 [&>div]:bg-emerald-500" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5 uppercase">
                    <span className="text-muted-foreground">Interesse Médio</span>
                    <span className="text-slate-900">{((contacts.warm / (contacts.total || 1)) * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={(contacts.warm / (contacts.total || 1)) * 100} className="h-1.5 bg-amber-500/10 [&>div]:bg-amber-500" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80 font-sans">Quota de Faturamento</h3>
                <Badge variant="secondary" className="text-[10px] uppercase font-bold">{plan.name}</Badge>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase">
                    <span className="text-muted-foreground">Consumo de Mensagens</span>
                    <span className={cn(messageUsagePct > 90 ? "text-red-500 font-black" : "text-slate-900")}>{messageUsagePct.toFixed(0)}%</span>
                  </div>
                  <Progress value={Math.min(messageUsagePct, 100)} className={cn("h-2.5 shadow-inner", messageUsagePct > 90 ? "[&>div]:bg-red-500" : "")} />
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[10px] text-muted-foreground">Limite do Plano</p>
                    <p className="text-[10px] text-slate-800 font-bold">{usage.totalMessages.toLocaleString()} / {(plan.limits?.messages || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
