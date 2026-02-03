import { User, Bot, MessageSquare, Clock, Phone, Calendar } from 'lucide-react';
import { Conversation } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ConversationDetailsPanelProps {
  data: Conversation;
}

export function ConversationDetailsPanel({ data }: ConversationDetailsPanelProps) {
  if (!data) return null;

  // const agent = mockAgents.find(a => a.id === data.agentId);

  return (
    <div className="p-6 space-y-6">
      {/* User Info */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Usuário</h3>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-muted flex items-center justify-center">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">{data.userName}</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Conversation Status */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Status da Conversa</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Status Atual</span>
            <Badge
              variant={data.status === 'human_active' ? 'default' : 'secondary'}
              className={data.status === 'human_active' ? 'bg-success' : 'bg-accent'}
            >
              {data.status === 'ai_active' ? 'IA Ativa' : 'Humano Ativo'}
            </Badge>
          </div>

          {data.assignedOperator && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Atendente</span>
              <span className="text-sm font-medium">{data.assignedOperator}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm">Canal</span>
            <div className="flex items-center gap-1">
              {data.channel === 'voice' ? (
                <Phone className="h-4 w-4" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              <span className="text-sm capitalize">{data.channel === 'voice' ? 'Voz' : 'Texto'}</span>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Agent Info */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Agente</h3>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="font-medium">Agente de Atendimento</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Metadata */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Metadados</h3>
        <div className="space-y-3">
          {/* ID Removed */}

          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Última atividade:</span>
            <span>{formatDistanceToNow(data.lastMessageTime, { addSuffix: true, locale: ptBR })}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Mensagens:</span>
            <span>{data.messages.length}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Technical History */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Histórico Técnico</h3>
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm">
            <div className="w-2 h-2 mt-1.5 bg-accent" />
            <div>
              <p className="font-medium">Conversa iniciada</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(Date.now() - 3600000), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
          </div>

          {data.status === 'human_active' && (
            <div className="flex items-start gap-2 text-sm">
              <div className="w-2 h-2 mt-1.5 bg-success" />
              <div>
                <p className="font-medium">Transferida para humano</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(Date.now() - 1800000), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
