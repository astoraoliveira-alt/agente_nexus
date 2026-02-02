import { Brain, Bot, Workflow, MessageSquare, User, Clock, ArrowRightLeft } from 'lucide-react';
import { AIDecisionLog, ConversationalFlow } from '@/lib/types';
import { Agent, Conversation } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface DecisionLogDetailsPanelProps {
  data: {
    log: AIDecisionLog;
    agent?: Agent;
    flow?: ConversationalFlow;
    conversation?: Conversation;
  };
}

export function DecisionLogDetailsPanel({ data }: DecisionLogDetailsPanelProps) {
  if (!data?.log) return null;

  const { log, agent, flow, conversation } = data;

  const getAutonomyBar = (level: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((l) => (
          <div 
            key={l}
            className={`w-5 h-5 ${l <= level ? 'bg-accent' : 'bg-muted'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-accent/10 flex items-center justify-center">
          <Brain className="h-7 w-7 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{log.decision}</h3>
          <p className="text-sm text-muted-foreground">
            {log.timestamp.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {log.humanOverride ? (
          <Badge className="bg-orange-600">Override Humano</Badge>
        ) : (
          <Badge variant="secondary">Decisão Automática</Badge>
        )}
      </div>

      <Separator />

      {/* Reasoning */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Raciocínio da IA</h4>
        <p className="text-sm bg-muted p-3">{log.reasoning}</p>
      </div>

      <Separator />

      {/* Autonomy */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Nível de Autonomia Utilizado</h4>
        <div className="flex items-center gap-4">
          {getAutonomyBar(log.autonomyUsed)}
          <span className="text-lg font-bold">{log.autonomyUsed}/5</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {log.autonomyUsed <= 2 ? 'Baixa autonomia - decisões simples' :
           log.autonomyUsed <= 3 ? 'Autonomia média - decisões padrão' :
           'Alta autonomia - decisões complexas'}
        </p>
      </div>

      <Separator />

      {/* Context */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Contexto</h4>

        {agent && (
          <div className="flex items-center gap-3 p-3 bg-muted">
            <Bot className="h-5 w-5 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Agente</p>
              <p className="font-medium text-sm">{agent.name}</p>
            </div>
          </div>
        )}

        {flow && (
          <div className="flex items-center gap-3 p-3 bg-muted">
            <Workflow className="h-5 w-5 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Fluxo</p>
              <p className="font-medium text-sm">{flow.name}</p>
            </div>
          </div>
        )}

        {conversation && (
          <div className="flex items-center gap-3 p-3 bg-muted">
            <MessageSquare className="h-5 w-5 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Conversa</p>
              <p className="font-medium text-sm">{conversation.userName}</p>
              <p className="text-xs text-muted-foreground">{conversation.id}</p>
            </div>
          </div>
        )}
      </div>

      {/* Override Info */}
      {log.humanOverride && log.overrideBy && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Informações do Override
            </h4>
            <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950/30">
              <User className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-xs text-muted-foreground">Operador que assumiu</p>
                <p className="font-medium text-sm">{log.overrideBy}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* IDs */}
      <Separator />
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Log ID:</span>
          <span className="font-mono">{log.id}</span>
        </div>
        <div className="flex justify-between">
          <span>Message ID:</span>
          <span className="font-mono">{log.messageId}</span>
        </div>
        <div className="flex justify-between">
          <span>Conversation ID:</span>
          <span className="font-mono">{log.conversationId}</span>
        </div>
      </div>
    </div>
  );
}
