import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { HomeOkr } from '@/services/home.service';

export function OkrSnapshotCard({ okrs }: { okrs: HomeOkr[] }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-950">OKR Snapshot</CardTitle>
        <p className="text-sm text-slate-500">Key outcomes that matter to product and business teams</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {okrs.map((okr) => (
          <div key={okr.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-950">{okr.objective}</p>
                <p className="text-sm text-slate-600">{okr.keyResult}</p>
              </div>
              <span className="text-sm font-semibold text-slate-700">{okr.progress}%</span>
            </div>
            <Progress value={okr.progress} className="h-2 bg-slate-100 [&>div]:bg-sky-600" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

