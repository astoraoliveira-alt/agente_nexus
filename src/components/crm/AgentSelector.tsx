import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot } from 'lucide-react';

interface AgentSelectorProps {
  agents: { id: string; name: string }[];
  selectedAgentId: string;
  onSelectAgentId: (id: string) => void;
  className?: string;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  selectedAgentId,
  onSelectAgentId,
  className = "w-full sm:w-[260px]"
}) => {
  return (
    <div className={className}>
      <Select value={selectedAgentId} onValueChange={onSelectAgentId}>
        <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-200">
          <div className="flex items-center gap-2 truncate">
            <Bot className="h-4 w-4 text-[#E5003A] shrink-0" />
            <SelectValue placeholder="Selecione o agente..." />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Todos os Agentes (Geral)</span>
          </SelectItem>
          {agents.map((ag) => (
            <SelectItem key={ag.id} value={ag.id}>
              <span className="truncate">{ag.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
