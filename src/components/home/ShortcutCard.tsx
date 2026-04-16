import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HomeShortcut } from '@/services/home.service';

export function ShortcutCard({ shortcut }: { shortcut: HomeShortcut }) {
  return (
    <Link to={shortcut.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 rounded-2xl">
      <Card className="h-full border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50">
        <CardHeader className="space-y-3">
          <Badge variant="secondary" className="w-fit bg-slate-100 text-slate-700">
            {shortcut.badge}
          </Badge>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base text-slate-950">{shortcut.title}</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-slate-400" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-slate-600">{shortcut.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

