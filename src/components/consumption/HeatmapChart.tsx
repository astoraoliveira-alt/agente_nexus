import { useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HeatmapData {
  hour: number;
  day: string;
  value: number;
}

interface HeatmapChartProps {
  data: HeatmapData[];
  title?: string;
}

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getIntensityClass(value: number, maxValue: number): string {
  const intensity = value / maxValue;
  if (intensity === 0) return 'bg-muted';
  if (intensity < 0.25) return 'bg-accent/20';
  if (intensity < 0.5) return 'bg-accent/40';
  if (intensity < 0.75) return 'bg-accent/70';
  return 'bg-accent';
}

export function HeatmapChart({ data, title = 'Horários de Pico' }: HeatmapChartProps) {
  const maxValue = Math.max(...data.map(d => d.value));

  const getValueForCell = (day: string, hour: number) => {
    const cell = data.find(d => d.day === day && d.hour === hour);
    return cell?.value || 0;
  };

  return (
    <div className="space-y-4">
      {title && <h3 className="font-semibold">{title}</h3>}
      
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex gap-1 ml-12 mb-2">
            {HOURS.filter((_, i) => i % 2 === 0).map(hour => (
              <div key={hour} className="w-6 text-center text-xs text-muted-foreground" style={{ width: '2.5rem' }}>
                {hour.toString().padStart(2, '0')}h
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="space-y-1">
            {DAYS.map(day => (
              <div key={day} className="flex items-center gap-1">
                <span className="w-10 text-xs text-muted-foreground text-right pr-2">{day}</span>
                <div className="flex gap-0.5">
                  {HOURS.map(hour => {
                    const value = getValueForCell(day, hour);
                    return (
                      <TooltipProvider key={`${day}-${hour}`} delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`w-5 h-5 cursor-pointer transition-all hover:ring-1 hover:ring-foreground ${getIntensityClass(value, maxValue)}`}
                            />
                          </TooltipTrigger>
                          <TooltipContent className="bg-card border border-border">
                            <div className="text-sm">
                              <p className="font-medium">{day} às {hour.toString().padStart(2, '0')}:00</p>
                              <p className="text-muted-foreground">{value.toLocaleString()} conversas</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-4 ml-12">
            <span className="text-xs text-muted-foreground">Menor</span>
            <div className="flex gap-0.5">
              <div className="w-4 h-4 bg-muted" />
              <div className="w-4 h-4 bg-accent/20" />
              <div className="w-4 h-4 bg-accent/40" />
              <div className="w-4 h-4 bg-accent/70" />
              <div className="w-4 h-4 bg-accent" />
            </div>
            <span className="text-xs text-muted-foreground">Maior</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Generate mock heatmap data
export function generateMockHeatmapData(): HeatmapData[] {
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const data: HeatmapData[] = [];

  days.forEach(day => {
    for (let hour = 0; hour < 24; hour++) {
      // Simulate realistic patterns
      let baseValue = 0;
      
      // Business hours have more traffic
      if (hour >= 9 && hour <= 18) {
        baseValue = 50 + Math.random() * 100;
      } else if (hour >= 7 && hour <= 21) {
        baseValue = 20 + Math.random() * 50;
      } else {
        baseValue = Math.random() * 20;
      }

      // Peak hours
      if ((hour >= 10 && hour <= 12) || (hour >= 14 && hour <= 16)) {
        baseValue *= 1.5;
      }

      // Weekends have less traffic
      if (day === 'Sáb' || day === 'Dom') {
        baseValue *= 0.4;
      }

      data.push({
        day,
        hour,
        value: Math.floor(baseValue),
      });
    }
  });

  return data;
}
