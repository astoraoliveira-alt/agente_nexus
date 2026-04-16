import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { HomeKpi } from '@/services/home.service';

const toneStyles = {
  positive: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  neutral: 'text-slate-700 bg-slate-50 border-slate-200',
};

export function ProductMetricCard({ metric }: { metric: HomeKpi }) {
  const isNegative = metric.delta.trim().startsWith('-');
  const TrendIcon = metric.tone === 'neutral' ? Minus : isNegative ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2 pb-3">
        <CardTitle className="text-sm font-medium text-slate-600">{metric.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium', toneStyles[metric.tone])}>
            <TrendIcon className="h-4 w-4" />
            {metric.delta}
          </span>
          <span className="text-slate-500">{metric.context}</span>
        </div>
      </CardContent>
    </Card>
  );
}

