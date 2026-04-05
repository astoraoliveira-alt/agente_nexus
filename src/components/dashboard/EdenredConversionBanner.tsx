import { Users, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EdenredConversionBannerProps {
  totalContacts: number;
  linkSentContacts: number;
  conversionRate: number;
  isLoading?: boolean;
}

/**
 * EdenredConversionBanner
 *
 * Tenant-specific widget shown ONLY for Edenred (d290f1ee-6c54-4b01-90e6-d701748f0851).
 * Displays the commercial conversion funnel:
 *   – Total unique contacts interacted
 *   – Unique contacts that received the proposal link
 *   – Conversion rate (link sent ÷ total)
 */
export function EdenredConversionBanner({
  totalContacts,
  linkSentContacts,
  conversionRate,
  isLoading = false,
}: EdenredConversionBannerProps) {
  const rateColor =
    conversionRate >= 60
      ? 'text-emerald-600'
      : conversionRate >= 30
      ? 'text-amber-500'
      : 'text-rose-500';

  const barColor =
    conversionRate >= 60
      ? 'bg-emerald-500'
      : conversionRate >= 30
      ? 'bg-amber-400'
      : 'bg-rose-500';

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm animate-pulse">
        <div className="h-4 w-48 bg-muted/40 rounded mb-6" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/30 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#e5003a]/20 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {/* Edenred red accent dot */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5003a] inline-block" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
            Funil de Conversão — Proposta&nbsp;
            <span className="text-[#e5003a]">Edenred</span>
          </h3>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* 1 – Total contacts */}
        <div className="flex flex-col gap-1 p-4 bg-slate-50 rounded-xl border border-border/40">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Users className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Contatos Ativos</span>
          </div>
          <p className="text-3xl font-black text-slate-900 tabular-nums">
            {totalContacts.toLocaleString('pt-BR')}
          </p>
          <p className="text-[10px] text-muted-foreground">Interações registradas</p>
        </div>

        {/* 2 – Link sent contacts */}
        <div className="flex flex-col gap-1 p-4 bg-slate-50 rounded-xl border border-border/40">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Link2 className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Link Enviado</span>
          </div>
          <p className="text-3xl font-black text-slate-900 tabular-nums">
            {linkSentContacts.toLocaleString('pt-BR')}
          </p>
          <p className="text-[10px] text-muted-foreground">Receberam a proposta</p>
        </div>

        {/* 3 – Conversion rate */}
        <div className="flex flex-col gap-1 p-4 bg-slate-50 rounded-xl border border-border/40">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest">Taxa de Conversão</span>
          </div>
          <p className={cn('text-3xl font-black tabular-nums', rateColor)}>
            {conversionRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">Link ÷ Contatos</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground mb-1.5">
          <span>Progresso de Conversão</span>
          <span className={rateColor}>{conversionRate.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(conversionRate, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {linkSentContacts} de {totalContacts} contatos receberam o link de proposta
        </p>
      </div>
    </div>
  );
}
