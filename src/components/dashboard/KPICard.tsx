import { LucideIcon, TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'accent' | 'warning' | 'critical' | 'success' | 'danger';
  onClick?: () => void;
  helpText?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  onClick,
  helpText
}: KPICardProps) {
  const variantColors: Record<string, { border: string; bg: string; text: string; helpHover: string }> = {
    default: { border: '', bg: 'bg-muted', text: 'text-foreground', helpHover: 'hover:text-foreground' },
    accent: { border: 'border-l-4 border-l-accent', bg: 'bg-accent/10', text: 'text-accent', helpHover: 'hover:text-accent' },
    warning: { border: 'border-l-4 border-l-warning', bg: 'bg-warning/10', text: 'text-warning', helpHover: 'hover:text-warning' },
    critical: { border: 'border-l-4 border-l-destructive', bg: 'bg-destructive/10', text: 'text-destructive', helpHover: 'hover:text-destructive' },
    success: { border: 'border-l-4 border-l-success', bg: 'bg-success/10', text: 'text-success', helpHover: 'hover:text-emerald-500' },
    danger: { border: 'border-l-4 border-l-destructive', bg: 'bg-destructive/10', text: 'text-destructive', helpHover: 'hover:text-destructive' },
  };

  const colors = variantColors[variant] || variantColors.default;

  return (
    <div
      className={cn(
        'kpi-card cursor-pointer relative',
        colors.border,
        onClick && 'hover:shadow-lg'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-10 h-10 flex items-center justify-center', colors.bg)}>
          <Icon className={cn('h-5 w-5', colors.text)} />
        </div>

        <div className="flex items-center gap-2">
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

          {helpText && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'text-muted-foreground/40 transition-colors',
                    colors.helpHover
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-[280px] p-3 bg-[#0F172A] text-white border-none shadow-xl"
              >
                <p className="text-[11px] leading-relaxed whitespace-pre-line">{helpText}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div>
        <p className="text-3xl font-bold mb-1">{value}</p>
        <p className="text-sm text-muted-foreground">{title}</p>
        {(subtitle || description) && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle || description}</p>
        )}
      </div>
    </div>
  );
}
