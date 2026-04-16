import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HomeRoadmapItem } from '@/services/home.service';

export function RoadmapCard({ items }: { items: HomeRoadmapItem[] }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-950">Release Roadmap</CardTitle>
        <p className="text-sm text-slate-500">Near-term delivery sequencing across product, data, and platform</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                {item.phase}
              </Badge>
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{item.eta}</span>
            </div>
            <p className="text-sm font-medium text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-600">Owner: {item.owner}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

