import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Brain, BookOpen, HelpCircle, RefreshCw,
  DollarSign, Activity, AlertTriangle, Zap,
  ShieldAlert, CheckCircle2, Clock, AlertCircle,
  FileText, Users, TrendingUp, MessageSquare,
  BarChart2, Layers, ShieldCheck, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MainLayout } from '@/components/layout/MainLayout';
import { coreService } from '@/services/core.service';
import { dashboardService } from '@/services/dashboard.service';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type TabId = 'executive' | 'economics' | 'security' | 'optimization' | 'knowledge' | 'stress';
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface CardTooltip { what: string; how: string; source: string; why: string }

// ─── PERIOD HELPERS ───────────────────────────────────────────────────────────

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  week: 'Últimos 7 dias',
  month: 'Últimos 30 dias',
};

function periodToRange(p: Period): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'today') return { start: fmt(today), end: fmt(now) };
  if (p === 'yesterday') {
    const yStart = new Date(today); yStart.setDate(yStart.getDate() - 1);
    return { start: fmt(yStart), end: fmt(today) };
  }
  if (p === 'week') {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: fmt(s), end: fmt(now) };
  }
  const s = new Date(today); s.setDate(s.getDate() - 29);
  return { start: fmt(s), end: fmt(now) };
}

function periodToRpcParam(p: Period): 'today' | 'yesterday' | 'custom' {
  if (p === 'today' || p === 'yesterday') return p;
  return 'custom';
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function InfoTip({ t }: { t: CardTooltip }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-xs p-3 text-xs space-y-1.5 z-50">
          <p className="font-bold">{t.what}</p>
          <p className="text-muted-foreground"><span className="font-semibold text-foreground/70">Cálculo: </span>{t.how}</p>
          <p className="text-muted-foreground"><span className="font-semibold text-foreground/70">Fonte: </span><code className="bg-muted px-1 py-0.5 text-[10px]">{t.source}</code></p>
          <p className="text-muted-foreground"><span className="font-semibold text-foreground/70">Impacto: </span>{t.why}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type StatusLevel = 'healthy' | 'warning' | 'critical' | 'neutral';

function StatusDot({ s }: { s: StatusLevel }) {
  return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block',
    s === 'healthy' && 'bg-emerald-500',
    s === 'warning' && 'bg-amber-400 animate-pulse',
    s === 'critical' && 'bg-rose-500 animate-pulse',
    s === 'neutral' && 'bg-muted-foreground/40',
  )} />;
}

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-6 h-6 flex items-center justify-center bg-muted border border-border rounded-sm flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs font-bold text-foreground">{title}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function DataBlock({ label, value, status = 'neutral', sub }: {
  label: string; value: string | number; status?: StatusLevel; sub?: string
}) {
  const accent: Record<StatusLevel, string> = {
    healthy: 'bg-emerald-500/50', warning: 'bg-amber-400/70', critical: 'bg-rose-500/70', neutral: 'bg-muted-foreground/20',
  };
  const border: Record<StatusLevel, string> = {
    healthy: 'border-border', warning: 'border-amber-500/30', critical: 'border-rose-500/40', neutral: 'border-border',
  };
  return (
    <div className={cn('relative bg-card border rounded-sm p-4 overflow-hidden', border[status])}>
      <div className={cn('absolute inset-x-0 top-0 h-0.5', accent[status])} />
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-black tabular-nums tracking-tight mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon, msg }: { icon?: React.ElementType; msg: string }) {
  const I = Icon ?? Info;
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <I className="h-6 w-6 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">{msg}</p>
    </div>
  );
}

function Shimmer() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-24 bg-muted/50 rounded-sm animate-pulse border border-border" />
      ))}
    </div>
  );
}

// ─── TAB: RESUMO EXECUTIVO ────────────────────────────────────────────────────

function TabExecutive({ data, period, loading }: { data: any; period: Period; loading: boolean }) {
  const m = data?.metrics;
  const errors: any[] = data?.errors ?? [];

  const n = (v: number | null | undefined) => loading ? '…' : v == null ? '—' : v.toLocaleString('pt-BR');
  const latMs = m?.avg_latency ?? null;
  const latLabel = loading ? '…' : latMs == null ? '—' : latMs < 1000 ? `${Math.round(latMs)}ms` : `${(latMs / 1000).toFixed(1)}s`;

  const success = m?.success ?? 0; const critical = m?.critical ?? 0;
  const pending = m?.pending ?? 0; const rejected = m?.rejected ?? 0;
  const total = success + critical + pending + rejected;
  const ratePct = total > 0 ? ((success / total) * 100).toFixed(1) : null;
  const latSt: StatusLevel = latMs == null ? 'neutral' : latMs < 3000 ? 'healthy' : latMs < 8000 ? 'warning' : 'critical';

  const cards = [
    { label: 'Total no Período', value: n(total), sub: PERIOD_LABEL[period], status: (loading ? 'neutral' : total > 0 ? 'healthy' : 'neutral') as StatusLevel,
      tooltip: { what: 'Total de mensagens processadas.', how: 'success + critical + pending + rejected', source: 'fn_get_mission_control_v2', why: 'Indica volume de tráfego.' } },
    { label: 'Sucesso', value: n(m?.success), sub: ratePct ? `${ratePct}% do total` : undefined, status: (loading ? 'neutral' : 'healthy') as StatusLevel,
      tooltip: { what: 'Mensagens processadas com sucesso.', how: "status IN ('done','completed','processed')", source: 'fn_get_mission_control_v2', why: 'Taxa de sucesso do pipeline.' } },
    { label: 'Erros Críticos', value: n(critical), sub: 'error/failed', status: (loading ? 'neutral' : critical > 0 ? 'critical' : 'healthy') as StatusLevel,
      tooltip: { what: 'Mensagens que falharam.', how: "status IN ('error','failed')", source: 'fn_get_mission_control_v2', why: 'Requer revisão imediata.' } },
    { label: 'Pendentes', value: n(pending), sub: 'pending/processing', status: (loading ? 'neutral' : pending > 50 ? 'warning' : 'healthy') as StatusLevel,
      tooltip: { what: 'Mensagens em fila.', how: "status IN ('pending','processing','queued')", source: 'fn_get_mission_control_v2', why: 'Volume alto indica gargalo.' } },
    { label: 'Rejeitadas', value: n(rejected), sub: 'regra de negócio', status: (loading ? 'neutral' : rejected > 0 ? 'warning' : 'healthy') as StatusLevel,
      tooltip: { what: "Mensagens com status = 'rejected'.", how: "status = 'rejected'", source: 'fn_get_mission_control_v2', why: 'Indica mensagens bloqueadas por políticas.' } },
    { label: 'Latência Média', value: latLabel, sub: 'avg queue_time', status: (loading ? 'neutral' : latSt) as StatusLevel,
      tooltip: { what: 'Tempo médio de processamento.', how: 'AVG(queue_time) em segundos', source: 'fn_get_mission_control_v2', why: 'Latência alta impacta UX.' } },
  ];

  const banner = !loading && (() => {
    if (total === 0) return { cls: 'bg-muted/40 border-border', msg: 'Sem mensagens no período.', color: 'text-muted-foreground' };
    if (critical > 0) return { cls: 'bg-rose-500/5 border-rose-500/20', msg: `⚠️ ${critical.toLocaleString('pt-BR')} erro(s) crítico(s) — verifique o Mission Control.`, color: 'text-rose-500' };
    if (pending > 50) return { cls: 'bg-amber-500/5 border-amber-500/20', msg: `${pending.toLocaleString('pt-BR')} mensagens pendentes — fila acima do normal.`, color: 'text-amber-400' };
    return { cls: 'bg-emerald-500/5 border-emerald-500/20', msg: `Operação saudável · ${total.toLocaleString('pt-BR')} msgs · taxa de sucesso ${ratePct}%`, color: 'text-emerald-500' };
  })();

  return (
    <section className="space-y-6">
      {loading ? <Shimmer /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map((c) => (
            <div key={c.label} className={cn('relative bg-card border rounded-sm p-4 overflow-hidden', c.status === 'critical' ? 'border-rose-500/40' : c.status === 'warning' ? 'border-amber-500/30' : 'border-border')}>
              <div className={cn('absolute inset-x-0 top-0 h-0.5', c.status === 'healthy' ? 'bg-emerald-500/60' : c.status === 'warning' ? 'bg-amber-400/80' : c.status === 'critical' ? 'bg-rose-500/80' : 'bg-muted-foreground/20')} />
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pr-1">{c.label}</p>
                <div className="flex items-center gap-1"><StatusDot s={c.status} /><InfoTip t={c.tooltip} /></div>
              </div>
              <p className="text-2xl font-black tabular-nums tracking-tight">{c.value}</p>
              {c.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>}
            </div>
          ))}
        </div>
      )}
      {banner && (
        <div className={cn('border rounded-sm p-4 text-sm', banner.cls)}>
          <span className={cn('font-semibold', banner.color)}>{banner.msg}</span>
        </div>
      )}
      {errors.length > 0 && (
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Erros Recentes ({errors.length})</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left font-medium px-4 py-2">Mensagem</th>
                <th className="text-left font-medium px-4 py-2">Agente</th>
                <th className="text-right font-medium px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {errors.slice(0, 10).map((e, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-rose-400 truncate max-w-[240px]">{e.error_message ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.agent_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground text-[10px]">
                    {e.created_at ? new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && errors.length === 0 && total > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Nenhum erro registrado no período.
        </div>
      )}
    </section>
  );
}

// ─── TAB: ECONOMIA & ROI ──────────────────────────────────────────────────────

function TabEconomics({ data, loading }: { data: any; loading: boolean }) {
  const s = data?.summary;
  const byAgent: any[] = data?.by_agent ?? [];
  const byType: any[] = data?.by_type ?? [];
  const byChannel: any[] = data?.by_channel ?? [];
  const n = (v: number | null | undefined, dec = 0) => loading ? '…' : v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const brl = (v: number | null | undefined) => loading ? '…' : v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <section className="space-y-6">
      {/* KPIs de custo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <DataBlock label="Custo Total" value={brl(s?.total_cost)} status={loading ? 'neutral' : s?.total_cost > 100 ? 'warning' : 'healthy'} />
        <DataBlock label="Total Tokens" value={loading ? '…' : (s?.total_tokens ?? 0).toLocaleString('pt-BR')} sub="itens processados" />
        <DataBlock label="Mensagens" value={n(s?.total_messages)} />
        <DataBlock label="STT (min)" value={n(s?.total_stt_min, 1)} sub="speech-to-text" />
        <DataBlock label="TTS (min)" value={n(s?.total_tts_min, 1)} sub="text-to-speech" />
        <DataBlock label="Custo / Msg" value={s?.avg_cost_per_msg == null ? '—' : `R$ ${Number(s.avg_cost_per_msg).toFixed(4)}`} sub="média por mensagem" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Custo por tipo */}
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={BarChart2} title="Custo por Tipo de Recurso" /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : byType.length === 0 ? <EmptyState msg="Sem dados no período" />
          : (
            <div className="divide-y divide-border/50">
              {byType.map((t, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="font-mono text-muted-foreground">{t.metric_type}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{Number(t.total_value).toLocaleString('pt-BR')} un</span>
                    <span className="font-bold tabular-nums">R$ {Number(t.total_cost).toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custo por agente */}
        <div className="bg-card border border-border rounded-sm lg:col-span-2">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={TrendingUp} title="Custo por Agente (Top 10)" /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3,4].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : byAgent.length === 0 ? <EmptyState msg="Sem dados de consumo no período" />
          : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Agente</th>
                  <th className="text-right font-medium px-4 py-2">Mensagens</th>
                  <th className="text-right font-medium px-4 py-2">Custo Total</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((a, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{a.agent_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{Number(a.total_msgs).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">R$ {Number(a.total_cost).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Por canal */}
      {byChannel.length > 0 && (
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={MessageSquare} title="Conversas por Canal" /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-border/50">
            {byChannel.map((ch, i) => (
              <div key={i} className="px-4 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground capitalize">{ch.channel}</p>
                <p className="text-xl font-black tabular-nums mt-1">{Number(ch.total_conversations).toLocaleString('pt-BR')}</p>
                <p className="text-[10px] text-emerald-500">{ch.completed} concluídas</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── TAB: SEGURANÇA & COMPLIANCE ─────────────────────────────────────────────

function auditImpact(action: string): StatusLevel {
  if (/delete|remove|ban|block|destroy/i.test(action)) return 'critical';
  if (/update|change|edit|takeover/i.test(action)) return 'warning';
  return 'neutral';
}

function TabSecurity({ data, loading }: { data: any; loading: boolean }) {
  const auditStats: any[] = data?.audit_stats ?? [];
  const recentLogs: any[] = data?.recent_logs ?? [];
  const errorStats: any[] = data?.error_stats ?? [];
  const bans = data?.contact_bans;

  return (
    <section className="space-y-6">
      {/* Contatos banidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DataBlock label="Contatos Banidos" value={loading ? '…' : bans?.total_banned ?? '—'} status={loading ? 'neutral' : (bans?.total_banned ?? 0) > 0 ? 'critical' : 'healthy'} />
        <DataBlock label="Contatos Bloqueados" value={loading ? '…' : bans?.total_blocked ?? '—'} status={loading ? 'neutral' : (bans?.total_blocked ?? 0) > 0 ? 'warning' : 'healthy'} />
        <DataBlock label="Total Contatos" value={loading ? '…' : (bans?.total_contacts ?? 0).toLocaleString('pt-BR')} />
        <DataBlock label="Tipos de Erros" value={loading ? '…' : errorStats.length} sub="causas raízes" status={loading ? 'neutral' : errorStats.length > 0 ? 'warning' : 'healthy'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Log de auditoria recente */}
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={ShieldCheck} title="Auditoria Recente" sub="Últimos 15 eventos" /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3,4].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : recentLogs.length === 0 ? <EmptyState icon={ShieldCheck} msg="Sem eventos de auditoria no período" />
          : (
            <div className="divide-y divide-border/50">
              {recentLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <StatusDot s={auditImpact(log.action)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{log.action}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{log.actor_name} · {log.details}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap ml-2">
                    {log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Causas raízes de erro */}
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={AlertTriangle} title="Causas de Erro" sub="Top incidentes do período" /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : errorStats.length === 0 ? <EmptyState icon={CheckCircle2} msg="Nenhum erro registrado no período" />
          : (
            <div className="divide-y divide-border/50">
              {errorStats.map((e, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <p className="font-mono text-rose-400 truncate max-w-[180px]">{e.error_type}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className={cn('text-[9px] tabular-nums',
                      e.impact === 'CRÍTICO' ? 'border-rose-500/40 text-rose-500' :
                      e.impact === 'ALTO'    ? 'border-amber-500/40 text-amber-400' :
                                               'border-border text-muted-foreground'
                    )}>
                      {e.impact}
                    </Badge>
                    <span className="font-bold">{e.count}×</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Frequência de ações por tipo */}
      {auditStats.length > 0 && (
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={Activity} title="Ações Mais Frequentes" sub="Frequência de eventos de auditoria" /></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Ação</th>
                  <th className="text-right font-medium px-4 py-2">Ocorrências</th>
                  <th className="text-right font-medium px-4 py-2">Atores únicos</th>
                </tr>
              </thead>
              <tbody>
                {auditStats.map((st, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono">
                      <div className="flex items-center gap-2">
                        <StatusDot s={auditImpact(st.action)} />
                        {st.action}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">{st.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{st.actors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── TAB: OTIMIZAÇÃO IA ───────────────────────────────────────────────────────

function TabOptimization({ data, loading }: { data: any; loading: boolean }) {
  const lat = data?.latency;
  const errorRate: any[] = data?.error_rate ?? [];
  const tokenStats: any[] = data?.token_stats ?? [];
  const channelMix: any[] = data?.channel_mix ?? [];
  const insights = data?.insights;

  const totalProcessed = lat?.total_processed ?? 0;
  const totalErrors    = lat?.total_errors    ?? 0;
  const globalRate     = totalProcessed + totalErrors > 0
    ? ((totalErrors / (totalProcessed + totalErrors)) * 100).toFixed(1)
    : '0.0';

  return (
    <section className="space-y-6">
      {/* KPIs de latência e desempenho */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DataBlock label="Latência Média" value={loading ? '…' : lat ? `${lat.avg_latency_sec}s` : '—'} status={loading ? 'neutral' : lat?.avg_latency_sec < 3 ? 'healthy' : lat?.avg_latency_sec < 8 ? 'warning' : 'critical'} sub="avg queue_time" />
        <DataBlock label="P95 Latência" value={loading ? '…' : lat ? `${lat.p95_latency_sec}s` : '—'} sub="percentil 95" status="neutral" />
        <DataBlock label="Taxa de Erro" value={loading ? '…' : `${globalRate}%`} status={loading ? 'neutral' : Number(globalRate) > 10 ? 'critical' : Number(globalRate) > 5 ? 'warning' : 'healthy'} sub="global" />
        <DataBlock label="Itens Presos" value={loading ? '…' : (insights?.stuck_count ?? 0).toLocaleString('pt-BR')} status={loading ? 'neutral' : (insights?.stuck_count ?? 0) > 0 ? 'warning' : 'healthy'} sub=">10 min sem resposta" />
      </div>

      {/* Banner de insights automáticos */}
      {!loading && insights && (
        <div className="space-y-2">
          {insights.has_high_error_rate && (
            <div className="border border-rose-500/30 bg-rose-500/5 rounded-sm p-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-400">Taxa de erro elevada</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {insights.error_rate_pct}% das mensagens falharam no período. Verifique os agentes com maior taxa de erro.
                </p>
              </div>
            </div>
          )}
          {insights.has_stuck_items && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm p-3 flex items-start gap-3">
              <Clock className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-400">{insights.stuck_count} item(s) preso(s) na fila</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Mensagens em estado pending/processing há mais de 10 minutos. Pode ser necessário reprocessamento.
                </p>
              </div>
            </div>
          )}
          {!insights.has_high_error_rate && !insights.has_stuck_items && (
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-sm p-3 flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-emerald-500">Pipeline saudável — sem alertas automáticos no período.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Taxa de erro por agente */}
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={AlertCircle} title="Taxa de Erro por Agente" sub="Agentes com maior falha" /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : errorRate.length === 0 ? <EmptyState icon={CheckCircle2} msg="Sem dados de erro no período" />
          : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Agente</th>
                  <th className="text-right font-medium px-4 py-2">Total</th>
                  <th className="text-right font-medium px-4 py-2">Erros</th>
                  <th className="text-right font-medium px-4 py-2">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {errorRate.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{r.agent_name}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{r.total}</td>
                    <td className="px-4 py-2.5 text-right text-rose-400">{r.errors}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn('font-bold', Number(r.error_rate) > 10 ? 'text-rose-400' : Number(r.error_rate) > 5 ? 'text-amber-400' : 'text-emerald-500')}>
                        {r.error_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Consumo de tokens por agente */}
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={Zap} title="Consumo de Tokens" sub="Top 10 agentes por tokens" /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : tokenStats.length === 0 ? <EmptyState icon={Zap} msg="Sem dados de tokens no período" />
          : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Agente</th>
                  <th className="text-right font-medium px-4 py-2">Tokens</th>
                  <th className="text-right font-medium px-4 py-2">Custo</th>
                </tr>
              </thead>
              <tbody>
                {tokenStats.map((t, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{t.agent_name}</p>
                      {t.channel && <p className="text-[10px] text-muted-foreground capitalize">{t.channel}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{Number(t.total_tokens).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">R$ {Number(t.total_cost).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mix de canais */}
      {channelMix.length > 0 && (
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={Layers} title="Mix de Canais" sub="Volume de mensagens por canal" /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-border/50">
            {channelMix.map((ch, i) => {
              const rate = ch.count > 0 ? ((ch.success / ch.count) * 100).toFixed(0) : 0;
              return (
                <div key={i} className="px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground capitalize">{ch.channel ?? 'desconhecido'}</p>
                  <p className="text-xl font-black tabular-nums mt-1">{Number(ch.count).toLocaleString('pt-BR')}</p>
                  <p className="text-[10px] text-emerald-500">{rate}% sucesso</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── TAB: CONHECIMENTO RAG ────────────────────────────────────────────────────

function fmtBytes(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TabKnowledge({ data, loading }: { data: any; loading: boolean }) {
  const docs: any[] = data?.docs ?? [];
  const s = data?.summary;
  const types: Record<string, number> = s?.types ?? {};
  const typeEntries = Object.entries(types).sort((a, b) => b[1] - a[1]);

  const byAgent = useMemo(() => {
    const map = new Map<string, { name: string; docs: number; size: number }>();
    docs.forEach((d) => {
      const key = d.agent_id ?? 'no-agent';
      const entry = map.get(key) ?? { name: d.agent_name ?? 'Agente Removido', docs: 0, size: 0 };
      entry.docs++;
      entry.size += d.file_size ?? 0;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.docs - a.docs);
  }, [docs]);

  return (
    <section className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DataBlock label="Documentos" value={loading ? '…' : (s?.total_docs ?? 0).toLocaleString('pt-BR')} sub="na base de conhecimento" />
        <DataBlock label="Agentes com RAG" value={loading ? '…' : (s?.total_agents ?? 0).toLocaleString('pt-BR')} sub="agentes ativos" status={loading ? 'neutral' : (s?.total_agents ?? 0) > 0 ? 'healthy' : 'neutral'} />
        <DataBlock label="Tamanho Total" value={loading ? '…' : fmtBytes(s?.total_size_bytes)} />
        <DataBlock label="Tipos de Arquivo" value={loading ? '…' : typeEntries.length} sub={typeEntries.map(([k]) => k).join(', ') || 'N/A'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Documentos por agente */}
        <div className="bg-card border border-border rounded-sm">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={Users} title="Cobertura por Agente" /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : byAgent.length === 0 ? <EmptyState icon={BookOpen} msg="Nenhum agente com documentos" />
          : (
            <div className="divide-y divide-border/50">
              {byAgent.map((ag, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <p className="font-medium truncate max-w-[140px]">{ag.name}</p>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-muted-foreground">{fmtBytes(ag.size)}</span>
                    <Badge variant="outline" className="text-[9px]">{ag.docs} doc{ag.docs === 1 ? '' : 's'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lista de documentos */}
        <div className="bg-card border border-border rounded-sm lg:col-span-2">
          <div className="px-4 pt-4 pb-2 border-b border-border"><SectionHeader icon={FileText} title="Documentos da Base" sub={`${docs.length} documento(s) listado(s)`} /></div>
          {loading ? <div className="p-4 space-y-2">{[1,2,3,4].map(i=><div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
          : docs.length === 0 ? <EmptyState icon={BookOpen} msg="Nenhum documento na base de conhecimento" />
          : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Documento</th>
                  <th className="text-left font-medium px-4 py-2">Agente</th>
                  <th className="text-right font-medium px-4 py-2">Tamanho</th>
                  <th className="text-right font-medium px-4 py-2">Adicionado</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium truncate max-w-[200px]">{doc.name}</p>
                      {doc.file_type && <p className="text-[10px] text-muted-foreground uppercase">{doc.file_type}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">{doc.agent_name}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtBytes(doc.file_size)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums text-[10px]">
                      {doc.created_at ? new Date(doc.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── TAB: STRESS TEST LAB ───────────────────────────────────────────────────

function TabStressLab({ tenantId }: { tenantId?: string }) {
  const [count, setCount] = useState(10);
  const [agentId, setAgentId] = useState<string>('');
  const [agents, setAgents] = useState<any[]>([]);
  const [isStressRunning, setIsStressRunning] = useState(false);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [systemLogs, setSystemLogs] = useState<{msg: string, type: 'sys' | 'db' | 'ai', time: string}[]>([]);

  const addSysLog = (msg: string, type: 'sys' | 'db' | 'ai' = 'sys') => {
    setSystemLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString('pt-BR') }, ...prev].slice(0, 50));
  };

  // Load agents on mount
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const { agents: agentsList } = await dashboardService.getDashboardSummary(tenantId || '');
        setAgents(agentsList || []);
        if (agentsList?.length > 0) setAgentId(agentsList[0].id);
      } catch (err) {
        console.error('Error loading agents for Stress Lab:', err);
      }
    };
    loadAgents();
  }, [tenantId]);

  // Poll for logs when a trace is active
  useEffect(() => {
    let interval: any;
    if (currentTraceId) {
      const fetchLogs = async () => {
        setMonitorLoading(true);
        try {
          const result = await coreService.getFailedMessages(tenantId, undefined, undefined, currentTraceId);
          
          // --- LOGGING EVOLUTION (Ponto 5 e 6 da crítica do usuário) ---
          
          // 1. Mensagens Pendentes/Enfileiradas
          const pending = result.filter(r => ['pending', 'queued'].includes(r.out_status)).length;
          const processing = result.filter(r => ['processing'].includes(r.out_status)).length;
          const done = result.filter(r => ['done', 'completed', 'processed'].includes(r.out_status)).length;
          const failed = result.filter(r => ['error', 'failed'].includes(r.out_status)).length;

          // Só loga a detecção inicial ou se houver mudança significativa no total
          if (result.length > logs.length && logs.length === 0) {
            addSysLog(`Sincronizado! Identificadas ${result.length} mensagens vinculadas ao lote ${currentTraceId}.`, 'db');
          }
          
          // Log de progresso inteligente (não repetitivo)
          if (processing > 0 && logs.filter(l => l.out_status === 'processing').length !== processing) {
            addSysLog(`Porteiro liberou fluxo: ${processing} mensagens entraram em processamento ativo.`, 'sys');
          }

          const newlyDone = done - logs.filter(r => ['done', 'completed', 'processed'].includes(r.out_status)).length;
          if (newlyDone > 0) {
            addSysLog(`Sucesso: +${newlyDone} respostas geradas pela Sofia e enviadas.`, 'ai');
          }

          const newlyFailed = failed - logs.filter(r => ['error', 'failed'].includes(r.out_status)).length;
          if (newlyFailed > 0) {
            addSysLog(`Alerta: ${newlyFailed} mensagens encontraram erros no fluxo do n8n.`, 'ai');
          }

          // Se estiver parado há muito tempo em processing
          if (processing > 0 && processing === result.length - done - failed) {
            // Apenas loga de vez em quando para não spammar
            if (Math.random() > 0.8) {
              addSysLog(`Aguardando orquestração do n8n para ${processing} itens remanescentes...`, 'sys');
            }
          }

          setLogs(result || []);
          
          // Stop polling if everything is 'done' or 'error'
          const stillRunning = result.some((r: any) => ['pending', 'processing', 'queued'].includes(r.out_status));
          if (result.length > 0 && !stillRunning) {
            addSysLog(`🏁 Lote ${currentTraceId} finalizado completamente.`, 'sys');
            setIsStressRunning(false);
          }
        } finally {
          setMonitorLoading(false);
        }
      };
      fetchLogs();
      interval = setInterval(fetchLogs, 3000);
    }
    return () => clearInterval(interval);
  }, [currentTraceId, tenantId, logs.length]);

  const handleStartStress = async () => {
    if (!tenantId || !agentId) return;
    setIsStressRunning(true);
    setLogs([]);
    setSystemLogs([]);
    addSysLog(`Iniciando simulação de carga: ${count} mensagens.`, 'sys');
    addSysLog(`Agente alvo carregado: ${agents.find(a => a.id === agentId)?.name}`, 'sys');
    
    try {
      addSysLog(`Solicitando geração de payloads no banco de dados...`, 'db');
      const traceId = await coreService.triggerStressTest(tenantId, agentId, count);
      setCurrentTraceId(traceId);
      addSysLog(`Massa injetada com sucesso! Trace ID: ${traceId}`, 'db');
      addSysLog(`Iniciando monitoramento da inbound_queue...`, 'sys');
    } catch (err: any) {
      console.error('Error starting stress test:', err);
      const errorMsg = err?.message || err?.details || 'Erro de permissão ou função não encontrada';
      addSysLog(`FALHA CRÍTICA: ${errorMsg}`, 'ai');
      setIsStressRunning(false);
    }
  };

  const handleCleanup = async () => {
    if (!currentTraceId) return;
    setIsCleaning(true);
    addSysLog(`Iniciando limpeza cirúrgica do Batch: ${currentTraceId}...`, 'sys');
    try {
      await coreService.cleanupStressTest(currentTraceId);
      setLogs([]);
      setCurrentTraceId(null);
      addSysLog(`Dados de teste removidos com sucesso! Ambiente limpo.`, 'db');
    } catch (err: any) {
      addSysLog(`Erro ao limpar dados: ${err.message}`, 'ai');
    } finally {
      setIsCleaning(false);
    }
  };

  const stats = useMemo(() => {
    const done = logs.filter(l => ['done', 'completed', 'processed'].includes(l.out_status)).length;
    const error = logs.filter(l => ['error', 'failed'].includes(l.out_status)).length;
    const pending = logs.length - done - error;
    const progress = logs.length > 0 ? (done / logs.length) * 100 : 0;
    return { done, error, pending, progress };
  }, [logs]);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de Configuração */}
        <div className="bg-card border border-border rounded-sm p-4 space-y-5">
          <SectionHeader icon={Zap} title="Configuração de Estresse" sub="Simule carga de mensagens na Sofia" />
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Selecionar Agente</label>
            <Select value={agentId} onValueChange={setAgentId} disabled={isStressRunning}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Escolha um agente" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Volume de Mensagens</label>
              <span className="text-sm font-black text-emerald-500">{count}</span>
            </div>
            <input 
              type="range" min="1" max="1000" step="10" value={count} 
              onChange={(e) => setCount(parseInt(e.target.value))}
              disabled={isStressRunning}
              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <Button 
            className={cn("w-full h-11 text-xs font-bold gap-2 uppercase tracking-widest", 
              isStressRunning ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-emerald-600 hover:bg-emerald-500 text-white"
            )}
            onClick={handleStartStress}
            disabled={isStressRunning || !agentId}
          >
            {isStressRunning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Estressando Sofia...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 fill-current" />
                Iniciar Estresse de IA
              </>
            )}
          </Button>

          {currentTraceId && (
            <Button 
                variant="outline"
                className="w-full h-9 text-[10px] font-bold gap-2 uppercase border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
                onClick={handleCleanup}
                disabled={isStressRunning || isCleaning}
            >
                <RefreshCw className={cn("h-3 w-3", isCleaning && "animate-spin")} />
                Limpar Dados deste Teste
            </Button>
          )}

          <div className="p-3 bg-muted/30 border border-border/50 rounded-sm space-y-2">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground">Atenção:</span> Este teste enviará mensagens reais para a `inbound_queue`. O n8n e a Sofia irão processar cada item como se fosse um cliente real.
            </p>
          </div>

          {/* Console Under the Hood */}
          {/* System Console Emulator (SLA ELITE UI) */}
          <div className="mt-4 bg-[#050505] rounded-sm border border-emerald-500/20 overflow-hidden flex flex-col h-[300px] shadow-2xl relative">
            <div className="bg-[#0a0a0a] px-3 py-1.5 border-b border-emerald-500/10 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-500/80 tracking-widest uppercase">Nexus System Console</span>
              </div>
              <span className="text-[8px] font-mono text-emerald-500/40 uppercase">v1.3-STRESS-SLA</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-1 selection:bg-emerald-500 selection:text-black custom-scrollbar bg-[radial-gradient(circle_at_center,_#001a0a_0%,_#050505_100%)]">
              {systemLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-emerald-500/10 italic text-[9px] uppercase tracking-tighter">
                  Aguardando comando do operador...
                </div>
              ) : (
                systemLogs.map((log, i) => (
                  <div key={i} className={cn(
                    "flex gap-3 animate-in fade-in slide-in-from-left-1 duration-300",
                    log.type === 'ai' ? "text-amber-400" : log.type === 'db' ? "text-blue-400" : "text-emerald-400"
                  )}>
                    <span className="opacity-30 shrink-0 text-zinc-500">[{log.time}]</span>
                    <span className="break-all">{log.msg}</span>
                  </div>
                ))
              )}
            </div>

            {monitorLoading && (
              <div className="absolute bottom-2 right-4 flex items-center gap-2 px-2 py-1 bg-black/80 rounded border border-emerald-500/20 animate-pulse">
                 <div className="h-1 w-1 rounded-full bg-emerald-500" />
                 <span className="text-[8px] text-emerald-500 uppercase font-bold tracking-tighter">Syncing...</span>
              </div>
            )}
          </div>
        </div>

        {/* Painel de Progresso */}
        <div className="lg:col-span-2 bg-card border border-border rounded-sm overflow-hidden flex flex-col">
          <div className="px-4 py-4 border-b border-border flex items-center justify-between">
            <SectionHeader icon={Activity} title="Monitor de Carga Live" sub={currentTraceId ?? 'Aguardando início...'} />
            {currentTraceId && (
              <Badge variant="outline" className="text-[9px] font-mono animate-pulse border-emerald-500/40 text-emerald-400">
                LIVE: {currentTraceId}
              </Badge>
            )}
          </div>

          <div className="flex-1 min-h-[300px]">
             {logs.length === 0 ? (
               <EmptyState icon={Brain} msg="Clique em Iniciar para começar a monitorar o fluxo ponta-a-ponta." />
             ) : (
               <div className="flex flex-col h-full">
                 {/* Progress Bar Area */}
                 <div className="px-6 py-6 border-b border-border/50 bg-muted/10 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-black tabular-nums">{logs.length}</p>
                        <p className="text-[9px] font-bold uppercase text-muted-foreground">Total</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-black tabular-nums text-emerald-500">{stats.done}</p>
                        <p className="text-[9px] font-bold uppercase text-muted-foreground">Sucesso</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-black tabular-nums text-rose-500">{stats.error}</p>
                        <p className="text-[9px] font-bold uppercase text-muted-foreground">Falhas</p>
                      </div>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-emerald-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                         style={{ width: `${stats.progress}%` }}
                       />
                    </div>
                 </div>

                 {/* Logs Table */}
                 <div className="flex-1 overflow-y-auto max-h-[400px]">
                   <table className="w-full text-[10px]">
                     <thead className="bg-muted/30 sticky top-0 border-b border-border/50 text-muted-foreground uppercase font-bold tracking-tighter">
                       <tr>
                         <th className="px-4 py-2 text-left w-16">Status</th>
                         <th className="px-4 py-2 text-left">Mensagem (Inbound)</th>
                         <th className="px-4 py-2 text-right">Ação</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-border/30">
                       {logs.map((log: any, i: number) => (
                         <tr key={i} className="hover:bg-muted/20 transition-colors">
                           <td className="px-4 py-3">
                             <Badge 
                               variant="outline" 
                               className={cn("text-[8.5px] h-5 min-w-[70px] justify-center uppercase", 
                                 log.out_status === 'done' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                                 log.out_status === 'processing' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                                 ['error', 'failed'].includes(log.out_status) && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                                 log.out_status === 'pending' && "bg-muted text-muted-foreground"
                               )}
                             >
                               {log.out_status}
                             </Badge>
                           </td>
                           <td className="px-4 py-3">
                             <p className="font-medium text-foreground truncate max-w-[250px]">
                               {log.out_payload?.text || 'Sem payload'}
                             </p>
                             <p className="text-[9px] text-muted-foreground font-mono">{log.out_external_id}</p>
                           </td>
                           <td className="px-4 py-3 text-right">
                             {log.out_error_message ? (
                               <span className="text-rose-400 font-bold whitespace-nowrap">{log.out_error_message.slice(0, 20)}...</span>
                             ) : (
                               <span className="text-muted-foreground tabular-nums">
                                 {new Date(log.out_created_at).toLocaleTimeString('pt-BR')}
                               </span>
                             )}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>
    </section>
  );
}

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'executive',     label: 'Resumo Executivo',  icon: Activity    },
  { id: 'economics',    label: 'Economia & ROI',    icon: DollarSign  },
  { id: 'security',     label: 'Segurança',          icon: ShieldAlert },
  { id: 'optimization', label: 'Otimização IA',      icon: Zap         },
  { id: 'knowledge',    label: 'Conhecimento RAG',   icon: BookOpen    },
  { id: 'stress',       label: 'Stress Lab',         icon: Zap         },
];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AIPerformanceCenter() {
  const { currentTenant } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('executive');
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(false);
  const [tabData, setTabData] = useState<Partial<Record<TabId, any>>>({});

  const fetchTab = useCallback(async (tab: TabId, prd: Period, tenantId?: string) => {
    setLoading(true);
    const { start, end } = periodToRange(prd);
    const tid = tenantId ?? undefined;
    try {
      let result: any = null;
      if (tab === 'executive') {
        result = await coreService.getMissionControlV2(tid, periodToRpcParam(prd), undefined, start, end);
      } else if (tab === 'economics') {
        result = await coreService.getAIPerfEconomics(tid, start, end);
      } else if (tab === 'security') {
        result = await coreService.getAIPerfSecurity(tid, start, end);
      } else if (tab === 'optimization') {
        result = await coreService.getAIPerfOptimization(tid, start, end);
      } else if (tab === 'knowledge') {
        result = await coreService.getAIPerfKnowledge(tid, start, end);
      }
      setTabData((prev) => ({ ...prev, [tab]: result }));
    } catch (err) {
      console.error(`[AIPerformanceCenter] Error fetching tab "${tab}":`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch when tab or period changes
  useEffect(() => {
    fetchTab(activeTab, period, currentTenant?.id);
  }, [activeTab, period, currentTenant?.id, fetchTab]);

  const handleRefresh = () => fetchTab(activeTab, period, currentTenant?.id);
  const data = tabData[activeTab];

  return (
    <MainLayout>
      <div className="flex flex-col h-full bg-background">

        {/* PAGE HEADER */}
        <header className="border-b border-border px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-emerald-500" />
                <h1 className="text-lg font-black tracking-tight">Centro de Performance e Otimização de IA</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentTenant?.name ?? 'Global'} · Visão estratégica e analítica da operação de IA
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="h-8 text-xs w-36 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="yesterday">Ontem</SelectItem>
                  <SelectItem value="week">Últimos 7 dias</SelectItem>
                  <SelectItem value="month">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 rounded-sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                Atualizar
              </Button>
            </div>
          </div>
        </header>

        {/* TAB BAR */}
        <nav className="flex items-center border-b border-border px-6 flex-shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-500'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60',
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* TAB CONTENT */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'executive'     && <TabExecutive    data={data} period={period} loading={loading} />}
          {activeTab === 'economics'    && <TabEconomics    data={data} loading={loading} />}
          {activeTab === 'security'     && <TabSecurity     data={data} loading={loading} />}
          {activeTab === 'optimization' && <TabOptimization data={data} loading={loading} />}
          {activeTab === 'knowledge'    && <TabKnowledge    data={data} loading={loading} />}
          {activeTab === 'stress'       && <TabStressLab    tenantId={currentTenant?.id} />}
        </main>
      </div>
    </MainLayout>
  );
}
