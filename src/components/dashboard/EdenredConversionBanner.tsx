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
 * Optimized for high-density and square geometry (Nexus Premium).
 */
export function EdenredConversionBanner({
  totalContacts,
  linkSentContacts,
  conversionRate,
  isLoading = false,
}: EdenredConversionBannerProps) {
  const rateColor =
    conversionRate >= 60
      ? 'text-emerald-500'
      : conversionRate >= 30
      ? 'text-amber-500'
      : 'text-[#e5003a]';

  const barColor =
    conversionRate >= 60
      ? 'bg-emerald-500'
      : conversionRate >= 30
      ? 'bg-amber-400'
      : 'bg-[#e5003a]';

  if (isLoading) {
    return (
      <div className="bg-white rounded-sm border border-border/50 p-4 shadow-sm animate-pulse">
        <div className="h-4 w-48 bg-muted/40 rounded mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/30 rounded-sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-sm border-2 border-slate-950 p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#e5003a] animate-pulse" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-800">
            Funil de Conversão Comercial — <span className="text-[#e5003a]">Edenred</span>
          </h3>
        </div>
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Real-Time Sync</div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* 1 – Total contacts */}
        <div className="flex flex-col gap-0.5 p-2 bg-slate-50 border border-slate-200 rounded-sm group hover:border-slate-950 transition-colors">
          <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
            <Users className="h-3 w-3" />
            <span className="text-[8px] font-black uppercase tracking-tighter">Contacts</span>
          </div>
          <p className="text-lg font-black text-slate-950 tabular-nums leading-none">
            {totalContacts.toLocaleString('pt-BR')}
          </p>
          <p className="text-[7px] font-bold uppercase text-slate-400 mt-1">Registrados</p>
        </div>

        {/* 2 – Link sent contacts */}
        <div className="flex flex-col gap-0.5 p-2 bg-slate-50 border border-slate-200 rounded-sm group hover:border-slate-950 transition-colors">
          <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
            <Link2 className="h-3 w-3" />
            <span className="text-[8px] font-black uppercase tracking-tighter">Deliveries</span>
          </div>
          <p className="text-lg font-black text-slate-950 tabular-nums leading-none">
            {linkSentContacts.toLocaleString('pt-BR')}
          </p>
          <p className="text-[7px] font-bold uppercase text-slate-400 mt-1">Links Enviados</p>
        </div>

        {/* 3 – Conversion rate */}
        <div className="flex flex-col gap-0.5 p-2 bg-slate-50 border border-slate-200 rounded-sm group hover:border-[#e5003a] transition-colors">
          <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
            <span className="text-[8px] font-black uppercase tracking-tighter">Yield</span>
          </div>
          <p className={cn('text-lg font-black tabular-nums leading-none', rateColor)}>
            {conversionRate.toFixed(1)}%
          </p>
          <p className="text-[7px] font-bold uppercase text-slate-400 mt-1">Ratio Final</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-[7px] font-black uppercase text-slate-500 mb-1">
          <span>Funnel Saturation</span>
          <span className={rateColor}>{conversionRate.toFixed(1)}%</span>
        </div>
        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(conversionRate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
