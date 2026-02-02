import { useState } from 'react';
import { 
  Brain, Search, Filter, Eye, User, Bot, 
  ArrowRightLeft, Clock, AlertTriangle 
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { mockAIDecisionLogs, mockFlows } from '@/lib/mock-extended-data';
import { mockAgents, mockConversations } from '@/lib/mock-data';

export default function DecisionLogs() {
  const { openSlideOver } = useApp();
  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterOverride, setFilterOverride] = useState<string>('all');

  const filteredLogs = mockAIDecisionLogs.filter(log => {
    const matchesSearch = log.decision.toLowerCase().includes(search.toLowerCase()) ||
                          log.reasoning.toLowerCase().includes(search.toLowerCase());
    const matchesAgent = filterAgent === 'all' || log.agentId === filterAgent;
    const matchesOverride = filterOverride === 'all' || 
                            (filterOverride === 'yes' && log.humanOverride) ||
                            (filterOverride === 'no' && !log.humanOverride);
    return matchesSearch && matchesAgent && matchesOverride;
  });

  const getAutonomyBar = (level: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((l) => (
          <div 
            key={l}
            className={`w-3 h-3 ${l <= level ? 'bg-accent' : 'bg-muted'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Logs de Decisão da IA</h1>
                  <p className="text-sm text-muted-foreground">Rastreabilidade e auditoria de decisões</p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-wrap gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar decisões..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterAgent} onValueChange={setFilterAgent}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filtrar por agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os agentes</SelectItem>
                  {mockAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterOverride} onValueChange={setFilterOverride}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Override humano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Com override</SelectItem>
                  <SelectItem value="no">Sem override</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Brain className="h-4 w-4" />
                Total de Decisões
              </div>
              <p className="text-2xl font-bold">{mockAIDecisionLogs.length}</p>
            </div>
            
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ArrowRightLeft className="h-4 w-4" />
                Overrides Humanos
              </div>
              <p className="text-2xl font-bold">{mockAIDecisionLogs.filter(l => l.humanOverride).length}</p>
            </div>
            
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Bot className="h-4 w-4" />
                Autonomia Média
              </div>
              <p className="text-2xl font-bold">
                {(mockAIDecisionLogs.reduce((acc, l) => acc + l.autonomyUsed, 0) / mockAIDecisionLogs.length).toFixed(1)}
              </p>
            </div>
            
            <div className="kpi-card">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                Último Registro
              </div>
              <p className="text-2xl font-bold">
                {Math.round((Date.now() - mockAIDecisionLogs[0]?.timestamp.getTime()) / 60000)}min
              </p>
            </div>
          </div>

          {/* Logs Table */}
          <div className="kpi-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Decisão</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agente</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fluxo</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Autonomia</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Override</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Hora</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const agent = mockAgents.find(a => a.id === log.agentId);
                  const flow = log.flowId ? mockFlows.find(f => f.id === log.flowId) : null;
                  const conversation = mockConversations.find(c => c.id === log.conversationId);
                  
                  return (
                    <tr 
                      key={log.id} 
                      className="border-b border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => openSlideOver('decision-log-details', { log, agent, flow, conversation })}
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium">{log.decision}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">{log.reasoning}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{agent?.name || '-'}</Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {flow?.name || <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-3 px-4">
                        {getAutonomyBar(log.autonomyUsed)}
                      </td>
                      <td className="py-3 px-4">
                        {log.humanOverride ? (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-orange-600">Sim</Badge>
                            <span className="text-xs text-muted-foreground">{log.overrideBy}</span>
                          </div>
                        ) : (
                          <Badge variant="secondary">Não</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {log.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredLogs.length === 0 && (
              <div className="text-center py-12">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum log encontrado</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
