
import React from 'react';
import { Agent } from '@/lib/types';

interface PoolUsageBarProps {
    totalLimit: number;
    companyUsage: number;
    agents: Agent[];
    agentUsages: Record<string, number>; // agentId -> usage cost
}

export function PoolUsageBar({ totalLimit, companyUsage, agents, agentUsages }: PoolUsageBarProps) {
    // Calculate percentages
    const totalUsagePct = Math.min((companyUsage / totalLimit) * 100, 100);
    const freePct = 100 - totalUsagePct;

    // Sort agents by usage desc
    const sortedAgents = [...agents].sort((a, b) => (agentUsages[b.id] || 0) - (agentUsages[a.id] || 0));

    // Access current theme colors via CSS variables or utility classes is tricky for dynamic logic.
    // We will use a predefined palette of tailwind colors.
    const colors = [
        'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
        'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
        'bg-red-500', 'bg-orange-500'
    ];

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium">
                <span>Uso do Pool (R$ {companyUsage.toFixed(2)} / R$ {totalLimit.toFixed(2)})</span>
                <span className="text-muted-foreground">{totalUsagePct.toFixed(1)}% Utilizado</span>
            </div>

            <div className="h-6 w-full bg-secondary rounded-full overflow-hidden flex relative ring-1 ring-border">
                {/* Render segments for each agent */}
                {sortedAgents.map((agent, index) => {
                    const usage = agentUsages[agent.id] || 0;
                    if (usage <= 0) return null;

                    const pct = (usage / totalLimit) * 100;
                    const colorClass = colors[index % colors.length];

                    return (
                        <div
                            key={agent.id}
                            className={`${colorClass} h-full transition-all duration-500 hover:brightness-110 cursor-help`}
                            style={{ width: `${pct}%` }}
                            title={`${agent.name}: R$ ${usage.toFixed(2)} (${pct.toFixed(1)}%)`}
                        />
                    );
                })}

                {/* Render Free Space (Invisible functionality, strictly background) */}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-2">
                {sortedAgents.map((agent, index) => {
                    const usage = agentUsages[agent.id] || 0;
                    if (usage <= 0) return null;
                    const colorClass = colors[index % colors.length].replace('bg-', 'text-'); // simple hack for text color

                    return (
                        <div key={agent.id} className="flex items-center gap-1.5 text-xs">
                            <div className={`w-2 h-2 rounded-full ${colors[index % colors.length]}`} />
                            <span className="font-medium text-foreground">{agent.name}</span>
                            <span className="text-muted-foreground">({((usage / totalLimit) * 100).toFixed(1)}%)</span>
                        </div>
                    );
                })}
                {freePct > 0.1 && (
                    <div className="flex items-center gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-secondary border border-border" />
                        <span className="text-muted-foreground">Livre ({freePct.toFixed(1)}%)</span>
                    </div>
                )}
            </div>
        </div>
    );
}
