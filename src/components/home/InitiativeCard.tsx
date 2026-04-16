import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { HomeInitiative } from '@/services/home.service';

const statusStyles: Record<HomeInitiative['status'], string> = {
  'On Track': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'At Risk': 'bg-rose-50 text-rose-700 border-rose-200',
  'Needs Review': 'bg-amber-50 text-amber-700 border-amber-200',
};

export function InitiativeCard({ initiative }: { initiative: HomeInitiative }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{initiative.quarter}</p>
            <CardTitle className="text-lg text-slate-950">{initiative.name}</CardTitle>
          </div>
          <Badge variant="outline" className={cn('border font-medium', statusStyles[initiative.status])}>
            {initiative.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{initiative.owner}</span>
            <span className="text-slate-500">{initiative.progress}%</span>
          </div>
          <Progress value={initiative.progress} className="h-2 bg-slate-100 [&>div]:bg-slate-900" />
        </div>
        <p className="text-sm leading-6 text-slate-600">{initiative.summary}</p>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-medium text-slate-900">Next checkpoint:</span> {initiative.milestone}
        </div>
      </CardContent>
    </Card>
  );
}

