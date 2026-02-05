import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'accent' | 'warning' | 'critical' | 'success';
  onClick?: () => void;
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  onClick
}: KPICardProps) {
  return (
    <div
      className={cn(
        'kpi-card cursor-pointer',
        variant === 'accent' && 'border-l-4 border-l-accent',
        variant === 'warning' && 'border-l-4 border-l-warning',
        variant === 'critical' && 'border-l-4 border-l-destructive',
        variant === 'success' && 'border-l-4 border-l-success',
        onClick && 'hover:shadow-lg'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          'w-10 h-10 flex items-center justify-center',
          variant === 'default' && 'bg-muted',
          variant === 'accent' && 'bg-accent/10',
          variant === 'warning' && 'bg-warning/10',
          variant === 'critical' && 'bg-destructive/10',
          variant === 'success' && 'bg-success/10'
        )}>
          <Icon className={cn(
            'h-5 w-5',
            variant === 'default' && 'text-foreground',
            variant === 'accent' && 'text-accent',
            variant === 'warning' && 'text-warning',
            variant === 'critical' && 'text-destructive',
            variant === 'success' && 'text-success'
          )} />
        </div>

        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-sm',
            trend.isPositive ? 'text-success' : 'text-destructive'
          )}>
            {trend.isPositive ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>{trend.value}%</span>
          </div>
        )}
      </div>

      <div>
        <p className="text-3xl font-bold mb-1">{value}</p>
        <p className="text-sm text-muted-foreground">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
