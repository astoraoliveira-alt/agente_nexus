import { Workflow, ArrowRight, Bot, CheckCircle2, Clock, Users, TrendingUp, Pencil, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationalFlow, FlowMetrics } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { mockAgents } from '@/lib/mock-data';

interface FlowDetailsPanelProps {
  data: {
    flow: ConversationalFlow;
    metrics?: FlowMetrics;
    onEdit?: () => void;
  };
}

export function FlowDetailsPanel({ data }: FlowDetailsPanelProps) {
  if (!data?.flow) return null;

  const { flow, metrics, onEdit } = data;
  const agents = flow.linked_agents.map(id => mockAgents.find(a => a.id === id)).filter(Boolean);

  const getStageIcon = (type: string) => {
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
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{flow.name}</h3>
            {onEdit && (
              <Button variant="outline" size="sm" className="h-7 gap-2 border-accent text-accent hover:bg-accent/5" onClick={onEdit}>
                <Pencil className="h-3 w-3" /> Editar Contrato
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{flow.description}</p>
        </div>
      </div>

      <div className="bg-muted/30 p-3 rounded-sm border border-border/50">
        <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 text-accent" />
          <p>Este painel é uma visão de monitoramento em tempo real (Read-Only). Para alterar regras ou etapas, utilize o botão <strong>Editar Contrato</strong> acima.</p>
        </div>
      </div>

      <div className="flex gap-2">
        {flow.type === 'outbound' ? (
          <Badge className="bg-purple-600">Outbound</Badge>
        ) : (
          <Badge variant="secondary">Inbound</Badge>
        )}
        {flow.status === 'active' ? (
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
          {flow.success_criteria}
        </p>
      </div>

      <Separator />

      {/* Stages */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Etapas do Fluxo</h4>
        <div className="space-y-4">
          {flow.stages.map((stage, idx) => (
            <div key={stage.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 bg-muted flex items-center justify-center text-lg">
                  {getStageIcon(stage.type)}
                </div>
                {idx < flow.stages.length - 1 && (
                  <div className="w-px h-6 bg-border mt-1" />
                )}
              </div>
              <div className="flex-1 pb-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{stage.name}</p>
                  <Badge variant="outline" className="text-[9px] capitalize px-1 h-3.5">{stage.actor_type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{stage.description}</p>
                <div className="flex flex-col gap-1 text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-sm mt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold uppercase opacity-60 text-[8px] min-w-[60px]">🎯 Outcome:</span>
                    <span className="font-mono text-green-600 dark:text-green-400">{stage.expected_outcome}</span>
                  </div>
                  {stage.escalation_rule && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold uppercase opacity-60 text-[8px] min-w-[60px]">⚠️ Escala:</span>
                      <span className="font-mono text-orange-600 dark:text-orange-400">{stage.escalation_rule}</span>
                    </div>
                  )}
                </div>
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
                  <span className="flex items-center gap-1.5">
                    Taxa de Sucesso
                  </span>
                  <span className="font-bold text-accent">{metrics.successRate.toFixed(1)}%</span>
                </div>
                <Progress value={metrics.successRate} className="h-2 rounded-none" />
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
                  <p className="text-lg font-bold text-blue-600">{(metrics.avgCompletionTime / 60).toFixed(1)}min</p>
                </div>

                <div className="bg-muted p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="h-4 w-4" />
                    <span className="text-xs">Intervenções</span>
                  </div>
                  <p className="text-lg font-bold text-orange-600">{metrics.humanInterventions.toLocaleString()}</p>
                </div>

                <div className="bg-muted p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
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
