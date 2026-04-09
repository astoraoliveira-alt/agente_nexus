import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Activity, 
  ShieldAlert, 
  Workflow, 
  Database, 
  Clock, 
  RefreshCcw, 
  Filter, 
  Calendar,
  LayoutGrid,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  User,
  History,
  Info,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  SearchCode
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from "@/components/ui/use-toast";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet';

// --- TYPES & INTERFACES ---
interface ObservatoryStats {
  avg_latency: number;
  success_rate: number;
  service_breakdown: { name: string; latency: number; success_rate: number; throughput?: number }[];
  latency_timeline: { time: string; throughput: number; porteiro_lat?: number; n8n_lat?: number }[];
}

interface TraceEvent {
  id: string;
  trace_id: string;
  event_type: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
  description: string;
  latency: string;
  latency_raw?: number;
  path?: string;
  payload: any;
  incident_ref?: string;
  component: 'porteiro' | 'n8n' | 'hub' | 'db';
}

interface RecentAlert {
  id: string;
  trace_id: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  contact_name: string;
  contact_phone: string;
}

export default function ConversationObservatory() {
  const { toast } = useToast();
  const { currentTenant, openSlideOver } = useApp();
  const [searchPhone, setSearchPhone] = useState('');
  const [searchDate, setSearchDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTrace, setActiveTrace] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<TraceEvent | null>(null);

  // --- QUERIES ---

  // 1. Overview Health Statistics
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['observatory-stats', currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      console.log('DEBUG Stats Request:', { p_tenant_id: currentTenant.id, p_date: searchDate });
      const { data, error } = await supabase.rpc('fn_get_observatory_stats', {
        p_tenant_id: currentTenant.id,
        p_date: searchDate
      });
      if (error) {
        console.error('DEBUG Stats Error:', error);
        throw error;
      }
      console.log('DEBUG Stats Success:', data);
      return data as ObservatoryStats;
    },
    enabled: !!currentTenant?.id,
    refetchInterval: 30000 // Refresh every 30s
  });

  // 2. Trace Lifecycle (Timeline)
  const { data: traceLifecycle, isLoading: isSearchingTrace } = useQuery({
    queryKey: ['trace-lifecycle', activeTrace, searchPhone, currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      const identifier = activeTrace || searchPhone;
      console.log('DEBUG Trace Request:', { p_tenant_id: currentTenant.id, p_identifier: identifier, p_date: searchDate });
      const { data, error } = await supabase.rpc('fn_get_trace_lifecycle', {
        p_tenant_id: currentTenant.id,
        p_identifier: identifier,
        p_date: searchDate
      });
      if (error) {
        console.error('DEBUG Trace Error:', error);
        throw error;
      }
      console.log('DEBUG Trace Success:', data);
      return data as TraceEvent[];
    },
    enabled: !!currentTenant?.id && (!!activeTrace || !!searchPhone)
  });

  // 3. Recent Critical Alerts
  const { data: recentAlerts } = useQuery({
    queryKey: ['recent-alerts', currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      const { data, error } = await supabase.rpc('fn_get_recent_alerts', {
        p_tenant_id: currentTenant.id
      });
      if (error) throw error;
      return data as RecentAlert[];
    },
    enabled: !!currentTenant?.id,
    refetchInterval: 15000
  });

  // --- HANDLERS ---
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchPhone) {
      setActiveTrace(null); // Search by phone prioritizes phone lineage
    }
  };

  const handleReset = () => {
    setSearchPhone('');
    setActiveTrace(null);
    setSelectedSignal(null);
  };

  // --- UI HELPERS ---
  const getEventIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'inbound': return Zap;
      case 'validation': return ShieldAlert;
      case 'workflow': return Workflow;
      case 'response': return CheckCircle2;
      default: return Database;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-emerald-500 border-emerald-600';
      case 'warning': return 'bg-amber-500 border-amber-600';
      case 'error': return 'bg-red-500 border-red-600';
      default: return 'bg-zinc-500 border-zinc-600';
    }
  };

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const isOverview = !activeTrace && !searchPhone;

  return (
    <MainLayout>
      <div className="flex h-full bg-background text-foreground font-sans overflow-hidden">
        
        {/* --- Sidebar: Filtros & Alertas --- */}
        <aside className="w-80 border-r border-border flex flex-col bg-card/10 shrink-0">
          <div className="p-5 border-b border-border bg-card/20">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4 flex items-center gap-2">
              <Filter className="h-3 w-3" /> Filtros de Auditoria
            </h2>
            
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-1.5 transition-all">
                <label className="text-[9px] font-bold uppercase text-muted-foreground/70 ml-1">Telefone ou Trace</label>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                  <Input 
                    placeholder="Ex: 551199999..."
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    className="pl-9 h-9 border-border bg-background focus:ring-1 focus:ring-accent rounded-none text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase text-muted-foreground/70 ml-1">Data de Referência</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className="pl-9 h-9 border-border bg-background focus:ring-1 focus:ring-accent rounded-none text-xs"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-9 bg-accent hover:bg-accent/90 text-white font-black uppercase text-[10px] tracking-widest rounded-none shadow-sm transition-all active:scale-[0.98]">
                <SearchCode className="h-4 w-4 mr-2" /> Localizar Sinal
              </Button>
            </form>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-5">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4 flex items-center justify-between">
                Sinais Críticos Recentes
                <Badge variant="outline" className="h-4 text-[8px] border-red-500/50 text-red-500 rounded-none bg-red-500/5 anim-pulse">LIVE</Badge>
              </h2>

              <div className="space-y-3">
                {recentAlerts?.map((alert) => (
                  <div 
                    key={alert.id}
                    onClick={() => setActiveTrace(alert.trace_id)}
                    className="p-3 bg-red-500/5 border border-red-500/20 hover:border-red-500/50 cursor-pointer transition-all group rounded-none"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-red-500" />
                        <span className="text-[10px] font-black uppercase text-foreground">{alert.contact_name}</span>
                      </div>
                      <span className="text-[8px] font-mono text-muted-foreground">{alert.timestamp}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug group-hover:text-foreground transition-colors line-clamp-2">
                      {alert.message}
                    </p>
                    <div className="mt-2 text-[9px] font-mono text-offset flex items-center justify-between opacity-50">
                      <span>TRACE: {alert.trace_id.substring(0, 8)}</span>
                      <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
                {!recentAlerts?.length && (
                  <div className="py-8 text-center border border-dashed border-border opacity-30 italic text-xs">
                     Nenhum alerta recente.
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* --- Main Content --- */}
        <main className="flex-1 flex flex-col overflow-hidden relative bg-card/5">
          
          {/* Header */}
          <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/20 shrink-0 backdrop-blur-sm z-50">
            <div className="flex items-center gap-4">
              <LayoutGrid className="h-4 w-4 text-accent" />
              <div>
                <h1 className="text-xs font-black tracking-widest text-foreground uppercase">
                  Conversation Observatory
                </h1>
                <p className="text-[9px] text-muted-foreground font-bold flex items-center gap-1.5 uppercase">
                  Auditoria de sinais de ponta-a-ponta • {currentTenant?.name || 'Global'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="text-right">
                <p className="text-[9px] text-muted-foreground font-black uppercase mb-0.5">Latência Média (Δ)</p>
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-lg font-black font-mono leading-none tracking-tighter text-accent">
                    {formatLatency(stats?.avg_latency || 0)}
                  </span>
                </div>
              </div>
              <div className="text-right border-l border-border pl-8">
                <p className="text-[9px] text-muted-foreground font-black uppercase mb-0.5">Taxa de Sucesso</p>
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-lg font-black font-mono leading-none tracking-tighter text-foreground">
                    {(stats?.success_rate || 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            {isOverview ? (
              /* --- DASHBOARD DE VISÃO GERAL --- */
              <ScrollArea className="h-full">
                <div className="p-8 max-w-6xl mx-auto space-y-8">
                  
                  {/* Grid de KPIs Principais */}
                  <div className="grid grid-cols-4 gap-6">
                    {[
                      { label: 'Saúde do Sistema', value: `${Math.round(stats?.success_rate || 0)}%`, color: 'text-green-500', icon: Activity },
                      { label: 'Total de Eventos (24h)', value: stats?.service_breakdown?.reduce((acc: number, s: any) => acc + (s.throughput || 0), 0) || 0, color: 'text-foreground', icon: RefreshCcw },
                      { label: 'Latência Média', value: `${(stats?.avg_latency || 0).toFixed(2)}s`, color: 'text-accent', icon: Zap },
                      { label: 'Taxa de Sucesso', value: `${(stats?.success_rate || 0).toFixed(1)}%`, color: 'text-emerald-500', icon: CheckCircle2 },
                    ].map((idx) => (
                      <div key={idx.label} className="p-5 border border-border bg-card/40 backdrop-blur-md rounded-none hover:border-accent/60 transition-all shadow-xl group">
                        <div className="flex items-center gap-3 mb-3">
                          <idx.icon className={cn("h-4 w-4 opacity-70 group-hover:scale-110 transition-transform", idx.color)} />
                          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{idx.label}</span>
                        </div>
                        <div className={cn("text-2xl font-black font-mono tracking-tighter", idx.color)}>
                          {stats ? idx.value : <span className="opacity-20">--</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Latência por Camada & Throughput */}
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 p-6 border border-border bg-background/40 backdrop-blur-sm rounded-none h-[350px]">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <Activity className="h-3 w-3 text-accent" /> Latência por Componente (s)
                        </h3>
                      </div>
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats?.service_breakdown || []} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" opacity={0.3} />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 9, fill: '#71717a', fontWeight: '900' }} 
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 9, fill: '#71717a', fontWeight: '900' }} 
                              unit="s"
                            />
                            <Tooltip 
                              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                              contentStyle={{ backgroundColor: '#09090b', border: '1px solid #14b8a6', borderRadius: '0', padding: '12px' }}
                              labelStyle={{ color: '#71717a', fontSize: '9px', fontWeight: 'black', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                              itemStyle={{ color: '#14b8a6', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}
                            />
                            <Bar 
                              dataKey="latency" 
                              name="Latência (s)" 
                              radius={[0, 0, 0, 0]} 
                              barSize={32}
                              minPointSize={4}
                            >
                              {(stats?.service_breakdown || []).map((entry: any, index: number) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.latency > 2 ? '#ef4444' : (entry.latency > 0.8 ? '#f59e0b' : '#14b8a6')} 
                                  fillOpacity={0.8}
                                  stroke={entry.latency > 2 ? '#ef4444' : (entry.latency > 0.8 ? '#f59e0b' : '#14b8a6')}
                                  strokeWidth={1}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="p-6 border border-border bg-card/20 rounded-none h-[350px]">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Saúde do Tráfego</h3>
                        <Badge className="bg-emerald-500/10 text-emerald-500 text-[8px] rounded-none border-emerald-500/30 font-black">ESTÁVEL</Badge>
                      </div>
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stats?.latency_timeline || []}>
                            <defs>
                              <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" opacity={0.3} />
                            <XAxis dataKey="time" hide />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#09090b', border: '1px solid #14b8a6', borderRadius: '0px' }}
                              itemStyle={{ color: '#14b8a6', fontSize: '10px', fontWeight: 'bold' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="throughput" 
                              stroke="#14b8a6" 
                              strokeWidth={2}
                              fill="url(#colorThroughput)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Sugestão de Auditoria */}
                  <div className="py-12 border border-dashed border-border rounded-none flex flex-col items-center justify-center text-center bg-card/5">
                    <div className="w-12 h-12 bg-accent/5 border border-accent/20 flex items-center justify-center mb-5 grayscale opacity-50">
                      <Search className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-tighter mb-2">Auditoria Profunda de Mensagem</h3>
                    <p className="text-[10px] text-muted-foreground max-w-sm mb-6 leading-relaxed">
                      Informe o Telefone ou o ID de Trânsito na lateral para desmaterializar o rastro de dados em uma linha do tempo técnica.
                    </p>
                    <div className="flex gap-4">
                       <div className="flex items-center gap-2 text-[9px] font-black text-muted-foreground bg-background px-3 py-1 border border-border">
                         <div className="w-2 h-2 bg-green-500 rounded-none" /> SUCESSO
                       </div>
                       <div className="flex items-center gap-2 text-[9px] font-black text-muted-foreground bg-background px-3 py-1 border border-border">
                         <div className="w-2 h-2 bg-amber-500 rounded-none" /> GARGALO
                       </div>
                       <div className="flex items-center gap-2 text-[9px] font-black text-muted-foreground bg-background px-3 py-1 border border-border">
                         <div className="w-2 h-2 bg-red-500 rounded-none" /> FALHA
                       </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              /* --- LINHA DO TEMPO DO TRACE --- */
              <div className="h-full flex overflow-hidden">
                <div className="flex-1 flex flex-col border-r border-border min-w-0">
                  <div className="p-4 border-b border-border bg-card/20 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-background text-[11px] font-black h-7 rounded-none border-border px-3">
                        {activeTrace?.includes('-') ? 'RASTRO:' : 'CLIENTE:'} <span className="text-accent ml-2 font-mono tracking-tighter">{(activeTrace || searchPhone)}</span>
                      </Badge>
                      <div className="h-px w-8 bg-accent/20 hidden sm:block" />
                      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent/80">Monitoramento Técnico</h2>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-[9px] font-black uppercase gap-2 hover:bg-accent/5 rounded-none border border-border">
                       <History className="h-3 w-3" /> Reiniciar Auditoria
                    </Button>
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-10 max-w-3xl mx-auto">
                      <div className="relative">
                        {/* Linha vertical técnica */}
                        <div className="absolute left-6 top-2 bottom-2 w-[1px] bg-border/40" />

                        <div className="space-y-10">
                          {isSearchingTrace ? (
                            <div className="text-center py-20 flex flex-col items-center gap-4">
                              <RefreshCcw className="h-6 w-6 text-accent animate-spin" />
                              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Desmaterializando Fluxo...</span>
                            </div>
                          ) : (traceLifecycle || []).map((step: any, idx: number) => {
                            const Icon = getEventIcon(step.event_type);
                            return (
                              <div 
                                key={step.id || idx} 
                                onClick={() => setSelectedSignal(step)}
                                className="relative pl-14 group cursor-pointer"
                              >
                                <div className={cn(
                                  "absolute left-2.5 top-0 w-7 h-7 rounded-none border border-background flex items-center justify-center z-10 transition-all shadow-md group-hover:scale-110",
                                  getStatusColor(step.status)
                                )}>
                                  <Icon className="h-3.5 w-3.5 text-white" />
                                </div>

                                <div className={cn(
                                  "p-5 rounded-none border border-border transition-all bg-card/40 hover:bg-card hover:border-accent hover:translate-x-1",
                                  selectedSignal?.id === step.id && 'border-accent bg-accent/5 ring-1 ring-accent/20'
                                )}>
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border border-border bg-background">
                                        {step.event_type}
                                      </span>
                                      <span className="text-[9px] text-muted-foreground/60 font-mono tracking-tighter">
                                        {new Date(step.timestamp).toLocaleTimeString()}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 border border-border bg-background/50">
                                      <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
                                      <span className="text-[10px] font-black font-mono">{step.latency}</span>
                                    </div>
                                  </div>
                                  <h4 className="text-[11px] font-black text-foreground mb-1 leading-relaxed tracking-tight uppercase line-clamp-2">{step.description}</h4>
                                  
                                  {step.incident_ref && (
                                    <div 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSlideOver('incident-details', { id: step.incident_ref });
                                      }}
                                      className="mt-4 p-3 rounded-none bg-red-500/5 border border-red-500/20 flex items-center justify-between hover:bg-red-500/10 transition-all cursor-pointer group/inc"
                                    >
                                      <div className="flex items-center gap-3">
                                        <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                                        <div>
                                          <p className="text-[9px] font-black text-red-600 uppercase leading-none">Alerta de Integridade</p>
                                          <p className="text-[9px] text-red-500/70 font-mono mt-1 tracking-tighter">REF: {step.incident_ref}</p>
                                        </div>
                                      </div>
                                      <ExternalLink className="h-3 w-3 text-red-500 opacity-50 group-hover/inc:opacity-100 transition-opacity" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {(!traceLifecycle?.length && !isSearchingTrace) && (
                            <div className="text-center py-20 opacity-30 italic text-xs">Rastro não encontrado ou sem eventos.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                {/* --- Lado Direito: Payload Inspector --- */}
                <aside className="w-[450px] hidden xl:flex flex-col border-l border-border bg-card/20 rounded-none shrink-0">
                  {selectedSignal ? (
                    <div className="h-full flex flex-col">
                      <div className="p-5 border-b border-border bg-background">
                        <div className="flex items-center gap-2 mb-1">
                          <Database className="h-4 w-4 text-accent" />
                          <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Payload Binário</h3>
                        </div>
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">{selectedSignal.event_type} • Δ {formatLatency(Number(selectedSignal.latency))}</p>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-5">
                           <div className="relative group">
                             <pre className="text-[11px] font-mono p-5 rounded-none bg-background border border-border overflow-x-auto text-foreground/80 leading-relaxed shadow-inner scrollbar-hide">
                               {JSON.stringify(selectedSignal.payload, null, 2)}
                             </pre>
                           </div>

                           <div className="mt-6 space-y-4">
                              <div className="p-5 rounded-none border border-border bg-card/30">
                                <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] mb-4 flex items-center gap-2">
                                  <div className="w-1 h-1 bg-accent animate-pulse" /> Metadados do Sinal
                                </h4>
                                <div className="space-y-3">
                                  {[
                                    { label: 'Componente Origem', value: selectedSignal.event_type || 'HUB_CORE' },
                                    { label: 'Rota de Trânsito', value: selectedSignal.path || selectedSignal.payload?.path || selectedSignal.payload?.destination || '/v1/webhook' },
                                    { label: 'Tamanho do Payload', value: `${(JSON.stringify(selectedSignal.payload || {}).length / 1024).toFixed(2)} KB` },
                                    { label: 'Node Executor', value: selectedSignal.payload?.server_url || selectedSignal.payload?.node_id || 'SERVER_BR_SP_01' }
                                  ].map(meta => (
                                    <div key={meta.label} className="flex justify-between items-center py-2 border-b border-border/20 group/meta">
                                      <span className="text-[9px] text-muted-foreground uppercase font-bold italic tracking-tighter group-hover/meta:text-accent transition-colors">{meta.label}</span>
                                      <span className="text-[10px] font-mono font-black text-foreground truncate max-w-[250px] text-right" title={meta.value}>{meta.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <Button 
                                variant="outline" 
                                onClick={() => {
                                  toast({
                                    title: "MAPEAMENTO DE FLUXO",
                                    description: "A renderização do rastro em grafo está sendo compilada para este Tenant.",
                                    variant: "default"
                                  });
                                }}
                                className="w-full text-[9px] font-black uppercase h-9 rounded-none border-border hover:bg-accent/10 hover:border-accent group/btn transition-all"
                              >
                                <Workflow className="h-3.5 w-3.5 mr-2 group-hover/btn:animate-spin" /> Visualizar Grafo Completo
                              </Button>
                           </div>
                        </div>
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-20 filter grayscale">
                      <Info className="h-12 w-12 mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-[0.4em]">Buffer Vazio</p>
                      <p className="text-[9px] mt-2 italic">Selecione um ponto no tempo para carregar os binários de auditoria.</p>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Sheet para visualização Mobile/Compacta */}
      <Sheet open={!!selectedSignal && window.innerWidth < 1280} onOpenChange={() => setSelectedSignal(null)}>
        <SheetContent side="right" className="w-[90%] sm:w-[600px] border-l border-border bg-background p-0 rounded-none">
          {selectedSignal && (
            <div className="h-full flex flex-col">
              <SheetHeader className="p-6 border-b border-border bg-card/10">
                <SheetTitle className="text-xs font-black uppercase flex items-center gap-2 tracking-widest text-accent">
                  <Database className="h-4 w-4" /> RAW DATA: {selectedSignal.event_type}
                </SheetTitle>
              </SheetHeader>
              <ScrollArea className="flex-1 p-6 bg-card/5">
                <pre className="text-[11px] font-mono p-5 bg-background border border-border text-foreground/80 leading-relaxed overflow-x-auto">
                  {JSON.stringify(selectedSignal.payload, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </MainLayout>
  );
}
