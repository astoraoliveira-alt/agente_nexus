import { useEffect, useState } from 'react';
import { dataSourceTracker } from '@/lib/data-source-tracker';
import { Badge } from '@/components/ui/badge';
import { Database, Zap, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';

export function DataSourceBadge() {
  const [sources, setSources] = useState<string[]>([]);
  const location = useLocation();

  useEffect(() => {
    // Clear sources on route change to refresh the "active" view for this page
    dataSourceTracker.clear();

    // Subscribe to tracker updates
    const unsubscribe = dataSourceTracker.subscribe((activeSources) => {
      setSources(activeSources);
    });

    return unsubscribe;
  }, [location.pathname]);

  if (sources.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex gap-2 animate-in fade-in slide-in-from-bottom-1 duration-500">
      {sources.includes('primary') && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/80 dark:bg-black/40 backdrop-blur-md border border-amber-500/20 shadow-sm transition-all hover:border-amber-500/40 group">
          <Database className="w-3 h-3 text-amber-500 animate-pulse" />
          <span className="text-[10px] font-bold text-amber-600/80 uppercase tracking-tight">EUA - West</span>
        </div>
      )}
      {sources.includes('replica') && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/80 dark:bg-black/40 backdrop-blur-md border border-blue-500/20 shadow-sm transition-all hover:border-blue-500/40 group">
          <Zap className="w-3 h-3 text-blue-500 fill-blue-500/20" />
          <span className="text-[10px] font-bold text-blue-600/80 uppercase tracking-tight">Brasil - SP</span>
        </div>
      )}
    </div>
  );
}
