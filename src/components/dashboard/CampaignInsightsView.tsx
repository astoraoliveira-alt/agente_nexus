import React, { useState, useEffect } from 'react';
import { 
  Users, 
  MessageSquare, 
  Activity, 
  Target, 
  ArrowUpRight, 
  TrendingUp,
  BarChart3,
  Calendar,
  Briefcase,
  Zap
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useApp } from '@/contexts/AppContext';
import { dashboardService } from '@/services/dashboard.service';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function CampaignInsightsView() {
  const { currentTenant } = useApp();
  const [days, setDays] = useState<number>(7); // Default 7 days
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentTenant) {
      loadInsights();
    }
  }, [currentTenant, days]);

  const loadInsights = async () => {
    setIsLoading(true);
    try {
      if (!currentTenant?.id) return;
      const result = await dashboardService.getExecutiveInsights(currentTenant.id, days);
      setData(result);
    } catch (error) {
      console.error("Error loading insights:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const timeFilters = [
    { label: 'Hoje', value: 0 },
    { label: '7 Dias', value: 7 },
    { label: '15 Dias', value: 15 },
    { label: '30 Dias', value: 30 },
    { label: 'Tudo', value: -1 },
  ];

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E5003A]"></div>
        <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Calculando Insights Executivos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <BarChart3 className="w-6 h-6 text-[#E5003A]" />
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Analytics de Performance</span>
                <span className="text-2xl font-black text-slate-900 italic tracking-tight">Insights de Negócio</span>
            </div>
        </div>

        <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-200">
          {timeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setDays(filter.value)}
              className={cn(
                "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                days === filter.value 
                  ? "bg-white text-[#E5003A] shadow-sm" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Big Numbers (Funil Executivo Estratégico) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* 1. Tentativa de Contatos (Base) */}
        <Card className="p-4 border-none shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-5">
                <Users className="w-12 h-12 text-slate-400" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Tentativa de Contatos</span>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{data?.totals?.leads || 0}</span>
                <Badge className="text-[8px] bg-slate-50 text-slate-500 border-none px-1 h-4">Carga</Badge>
            </div>
        </Card>

        {/* 2. Mensagens Enviadas (Sucesso) */}
        <Card className="p-4 border-none shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-5">
                <ArrowUpRight className="w-12 h-12 text-blue-600" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Mensagens Enviadas</span>
            <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900">{data?.totals?.sent || 0}</span>
                    <span className="text-[10px] font-bold text-blue-500">
                        {data?.totals?.leads > 0 ? ((data.totals.sent / data.totals.leads) * 100).toFixed(0) : 0}%
                    </span>
                </div>
                <span className="text-[8px] font-bold text-slate-400 uppercase">Sucesso vs Carga</span>
            </div>
        </Card>

        {/* 3. Respostas Recebidas */}
        <Card className="p-4 border-none shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-5">
                <Activity className="w-12 h-12 text-emerald-600" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Respostas Recebidas</span>
            <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900">{data?.totals?.responses || 0}</span>
                    <span className="text-[10px] font-bold text-emerald-500">
                        {data?.totals?.leads > 0 ? ((data.totals.responses / data.totals.leads) * 100).toFixed(0) : 0}%
                    </span>
                </div>
                <span className="text-[8px] font-bold text-slate-400 uppercase">Engate vs Carga</span>
            </div>
        </Card>

        {/* 4. Conversões (Link) */}
        <Card className="p-4 border-none shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-5">
                <Target className="w-12 h-12 text-[#E5003A]" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Conversões Realizadas</span>
            <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900">{data?.totals?.conversions || 0}</span>
                    <span className="text-[10px] font-bold text-[#E5003A]">
                        {data?.totals?.leads > 0 ? ((data.totals.conversions / data.totals.leads) * 100).toFixed(0) : 0}%
                    </span>
                </div>
                <span className="text-[8px] font-bold text-slate-400 uppercase">ROI vs Carga</span>
            </div>
        </Card>

        {/* 5. Volume Total de Msgs */}
        <Card className="p-4 border-none shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-5">
                <MessageSquare className="w-12 h-12 text-blue-600" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Volume de Mensagens</span>
            <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">{data?.totals?.total_messages || data?.totals?.messages || 0}</span>
                <Badge className="text-[8px] bg-blue-50 text-blue-600 border-none px-1 h-4">Total</Badge>
            </div>
            {(data?.totals?.campaign_messages ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-sm font-bold text-slate-500">{data.totals.campaign_messages}</span>
                    <span className="text-[9px] text-slate-400 leading-tight">via campanha</span>
                </div>
            )}
        </Card>

        {/* 6. Estratégias Ativas */}
        <Card className="p-4 border-none shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-5">
                <Briefcase className="w-12 h-12 text-purple-600" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Estratégias Ativas</span>
            <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">{data?.totals?.campaigns || 0}</span>
                <Badge className="text-[8px] bg-purple-50 text-purple-600 border-none px-1 h-4">Campaigns</Badge>
            </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Timeline Chart */}
        <Card className="xl:col-span-2 p-8 border-none shadow-sm flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Atividade Outbound</span>
                    <span className="text-lg font-black text-slate-900">Histórico de Engajamento</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-[10px] font-bold uppercase text-slate-400">Envios</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold uppercase text-slate-400">Conversões</span>
                    </div>
                </div>
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.daily}>
                        <defs>
                            <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false}
                            tickLine={false}
                            tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}}
                            tickFormatter={(val) => format(new Date(val), 'dd MMM', { locale: ptBR })}
                        />
                        <YAxis hide />
                        <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            labelFormatter={(val) => format(new Date(val), 'dd/MM/yyyy')}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="sent" 
                            stroke="#3b82f6" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorSent)" 
                        />
                        <Area 
                            type="monotone" 
                            dataKey="conversions" 
                            stroke="#10b981" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorConv)" 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>

        {/* Efficiency Chart */}
        <Card className="p-8 border-none shadow-sm flex flex-col gap-8">
            <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Eficiência de I.A</span>
                <span className="text-lg font-black text-slate-900">Esforço vs. Conversão</span>
            </div>

            <div className="space-y-6">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Média Geral por Lead</span>
                        <span className="text-xl font-black text-slate-900">{data?.averages?.total ?? 0} msgs</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-300" style={{ width: '60%' }} />
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold uppercase text-emerald-600">Leads Convertidos</span>
                        <span className="text-xl font-black text-emerald-600">{data?.averages?.converted ?? 0} msgs</span>
                    </div>
                    <div className="h-2 bg-emerald-50 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: '40%' }} />
                    </div>
                    <p className="text-[9px] font-medium text-slate-400 italic">Conversas vencedoras levam em média esta intensidade.</p>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold uppercase text-[#E5003A]">Leads Não Convertidos</span>
                        <span className="text-xl font-black text-[#E5003A]">{data?.averages?.failed ?? 0} msgs</span>
                    </div>
                    <div className="h-2 bg-[#E5003A]/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[#E5003A]" style={{ width: '85%' }} />
                    </div>
                    <p className="text-[9px] font-medium text-slate-400 italic">Atenção: Leads sem interesse exigem mais iterações.</p>
                </div>
            </div>

            <div className="mt-auto p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="flex gap-3 items-center">
                    <Zap className="w-5 h-5 text-amber-400 shrink-0" />
                    <p className="text-[10px] font-bold text-slate-600 leading-tight">
                        Insight: Conversas com mais de {Math.ceil((data?.averages?.converted ?? 0) * 1.5) || 5} msgs tendem a perder o engajamento.
                    </p>
                </div>
            </div>
        </Card>
      </div>

      {/* Bottom Section: Message Volume & Funnel */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-12">
         {/* Daily Message Volume Chart */}
         <Card className="p-8 border-none shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-sm font-black uppercase text-slate-900 tracking-tight">Volume de Mensagens Diário</span>
                </div>
                <Badge variant="outline" className="text-[9px] uppercase font-bold border-slate-200">Total Interactions</Badge>
            </div>
            
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.daily}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false}
                            tickLine={false}
                            tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}}
                            tickFormatter={(val) => format(new Date(val), 'dd MMM', { locale: ptBR })}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                        <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            labelFormatter={(val) => format(new Date(val), 'dd/MM/yyyy')}
                        />
                        <Bar 
                            dataKey="total_messages" 
                            fill="#3b82f6" 
                            radius={[6, 6, 0, 0]}
                            barSize={32}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
         </Card>

         {/* Strategic Conversion Funnel */}
         <Card className="p-8 border-none shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <Activity className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-sm font-black uppercase text-slate-900 tracking-tight">Funil de Conversão Executivo</span>
                </div>
                <Badge className="bg-[#E5003A] text-white border-none text-[9px] font-black uppercase">Filtro de Funil</Badge>
            </div>

            <div className="flex-1 flex flex-col justify-between py-2">
                {/* Step 1: Carga */}
                <div className="flex items-center gap-6">
                    <div className="w-24 text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block">CARGA</span>
                        <span className="text-lg font-black text-slate-900">{data?.totals?.leads}</span>
                    </div>
                    <div className="flex-1 h-12 bg-slate-100/30 rounded-xl relative overflow-hidden group">
                        <div className="absolute inset-y-0 left-0 bg-slate-500/10 w-full" />
                        <div className="absolute inset-0 flex items-center px-4">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Leads Totais (Base)</span>
                        </div>
                    </div>
                </div>

                {/* Step 2: Outreach */}
                <div className="flex items-center gap-6">
                    <div className="w-24 text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block">ALCANCE</span>
                        <span className="text-lg font-black text-slate-900">{data?.totals?.sent}</span>
                    </div>
                    <div className="flex-1 h-12 bg-slate-100/50 rounded-xl relative overflow-hidden group">
                        <div className="absolute inset-y-0 left-0 bg-blue-500/10 w-full" />
                        <div className="absolute inset-y-0 left-0 bg-blue-500 w-full" />
                        <div className="absolute inset-0 flex items-center px-4">
                            <span className="text-[9px] font-black text-white uppercase tracking-widest">Contatos Entregues ({data?.totals?.leads > 0 ? (data.totals.sent / data.totals.leads * 100).toFixed(0) : 0}%)</span>
                        </div>
                    </div>
                </div>

                {/* Step 3: Response */}
                <div className="flex items-center gap-6">
                    <div className="w-24 text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block">ENGATE</span>
                        <span className="text-lg font-black text-slate-900">{data?.totals?.responses}</span>
                    </div>
                    <div className="flex-1 h-12 bg-slate-100/50 rounded-xl relative overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-blue-400 w-[65%] transition-all duration-700" style={{ width: `${data?.totals?.sent > 0 ? (data.totals.responses / data.totals.sent * 100) : 0}%` }} />
                        <div className="absolute inset-0 flex items-center px-4">
                            <span className="text-[9px] font-black text-white uppercase tracking-widest">
                                Respostas Ativas ({data?.totals?.sent > 0 ? (data.totals.responses / data.totals.sent * 100).toFixed(1) : 0}%)
                            </span>
                        </div>
                    </div>
                </div>

                {/* Step 4: Conversion */}
                <div className="flex items-center gap-6">
                    <div className="w-24 text-right">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none block">CONVERSÃO</span>
                        <span className="text-lg font-black text-emerald-600">{data?.totals?.conversions}</span>
                    </div>
                    <div className="flex-1 h-12 bg-slate-100/50 rounded-xl relative overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-emerald-500 w-[30%] shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all duration-1000" style={{ width: `${data?.totals?.sent > 0 ? (data.totals.conversions / data.totals.sent * 100) : 0}%` }} />
                        <div className="absolute inset-0 flex items-center px-4">
                            <span className="text-[9px] font-black text-white uppercase tracking-widest">
                                Conversão Final ({data?.totals?.sent > 0 ? (data.totals.conversions / data.totals.sent * 100).toFixed(1) : 0}%)
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Yield de Conversão</span>
                </div>
                <span className="text-xl font-black text-slate-900">
                    {data?.totals?.sent > 0 ? (data.totals.conversions / data.totals.sent * 100).toFixed(1) : 0}%
                </span>
            </div>
         </Card>
      </div>
    </div>
  );
}
