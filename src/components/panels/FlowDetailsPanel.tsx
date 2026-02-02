import { Workflow, ArrowRight, Bot, CheckCircle2, Clock, Users, TrendingUp } from 'lucide-react';
import { ConversationalFlow, FlowMetrics } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { mockAgents } from '@/lib/mock-data';

interface FlowDetailsPanelProps {
  data: {
    flow: ConversationalFlow;
    metrics?: FlowMetrics;
  };
}

export function FlowDetailsPanel({ data }: FlowDetailsPanelProps) {
  if (!data?.flow) return null;

  const { flow, metrics } = data;
  const agents = flow.agentIds.map(id => mockAgents.find(a => a.id === id)).filter(Boolean);

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'greeting':
        return '👋';
      case 'qualification':
        return '🔍';
      case 'resolution':
        return '✅';
      case 'handoff':
        return '🔄';
      case 'closing':
        return '🏁';
      default:
        return '📍';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-accent/10 flex items-center justify-center">
          <Workflow className="h-7 w-7 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{flow.name}</h3>
          <p className="text-sm text-muted-foreground">{flow.description}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {flow.type === 'outbound' ? (
          <Badge className="bg-purple-600">Outbound</Badge>
        ) : (
          <Badge variant="secondary">Inbound</Badge>
        )}
        {flow.isActive ? (
          <Badge className="bg-green-600">Ativo</Badge>
        ) : (
          <Badge variant="outline">Inativo</Badge>
        )}
      </div>

      <Separator />

      {/* Objective */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Objetivo</h4>
        <p className="text-sm bg-muted p-3">{flow.objective}</p>
      </div>

      {/* Success Criteria */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Critério de Sucesso</h4>
        <p className="text-sm bg-green-50 dark:bg-green-950/30 p-3 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 inline mr-2" />
          {flow.successCriteria}
        </p>
      </div>

      <Separator />

      {/* Steps */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Etapas do Fluxo</h4>
        <div className="space-y-2">
          {flow.steps.map((step, idx) => (
            <div key={step.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 bg-muted flex items-center justify-center text-lg">
                  {getStepIcon(step.type)}
                </div>
                {idx < flow.steps.length - 1 && (
                  <div className="w-px h-4 bg-border" />
                )}
              </div>
              <div className="flex-1 pb-2">
                <p className="font-medium text-sm">{step.name}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
                <Badge variant="outline" className="text-[10px] mt-1 capitalize">{step.type}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Agents */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Agentes Vinculados
        </h4>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <Badge key={agent?.id} variant="secondary">
              <Bot className="h-3 w-3 mr-1" />
              {agent?.name}
            </Badge>
          ))}
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Métricas de Desempenho
            </h4>
            
            <div className="space-y-4">
              {/* Success Rate */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Taxa de Sucesso</span>
                  <span className="font-bold text-accent">{metrics.successRate}%</span>
                </div>
                <Progress value={metrics.successRate} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs">Conversas</span>
                  </div>
                  <p className="text-lg font-bold">{metrics.totalConversations.toLocaleString()}</p>
                </div>

                <div className="bg-muted p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs">Tempo Médio</span>
                  </div>
                  <p className="text-lg font-bold">{(metrics.avgCompletionTime / 60).toFixed(1)}min</p>
                </div>

                <div className="bg-muted p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="h-4 w-4" />
                    <span className="text-xs">Intervenções</span>
                  </div>
                  <p className="text-lg font-bold">{metrics.humanInterventions.toLocaleString()}</p>
                </div>

                <div className="bg-muted p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="h-4 w-4" />
                    <span className="text-xs">Taxa Interv.</span>
                  </div>
                  <p className="text-lg font-bold">{metrics.humanInterventionRate}%</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
