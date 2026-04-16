import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HomeActivity } from '@/services/home.service';

export function ActivityFeedCard({ items }: { items: HomeActivity[] }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-slate-950">Cross-team Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4">
            <div className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-slate-900" />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-slate-950">{item.actor}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{item.team}</span>
                <span className="text-slate-600">{item.action}</span>
              </div>
              <p className="text-sm leading-6 text-slate-600">{item.detail}</p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{item.timestamp}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

