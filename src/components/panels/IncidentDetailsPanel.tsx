import { useState } from 'react';
import { AlertTriangle, Bot, MessageSquare, Calendar, User, CheckCircle2 } from 'lucide-react';
import { AIIncident } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { mockAgents } from '@/lib/mock-data';
import { toast } from 'sonner';

interface IncidentDetailsPanelProps {
  data: AIIncident;
}

export function IncidentDetailsPanel({ data }: IncidentDetailsPanelProps) {
  const [actionTaken, setActionTaken] = useState(data?.actionTaken || '');
  const [isResolving, setIsResolving] = useState(false);

  if (!data) return null;

  const agent = mockAgents.find(a => a.id === data.agentId);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Crítico</Badge>;
      case 'high':
        return <Badge className="bg-orange-600">Alto</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Médio</Badge>;
      default:
        return <Badge variant="secondary">Baixo</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge className="bg-green-600">Resolvido</Badge>;
      case 'investigating':
        return <Badge className="bg-blue-600">Investigando</Badge>;
      default:
        return <Badge variant="destructive">Aberto</Badge>;
    }
  };

  const handleResolve = () => {
    setIsResolving(true);
    setTimeout(() => {
      toast.success('Incidente marcado como resolvido');
      setIsResolving(false);
    }, 1000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 flex items-center justify-center ${
          data.severity === 'critical' ? 'bg-destructive/10' :
          data.severity === 'high' ? 'bg-orange-100 dark:bg-orange-950/30' :
          'bg-warning/10'
        }`}>
          <AlertTriangle className={`h-7 w-7 ${
            data.severity === 'critical' ? 'text-destructive' :
            data.severity === 'high' ? 'text-orange-600' :
            'text-warning'
          }`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{data.title}</h3>
          <p className="text-sm text-muted-foreground">ID: {data.id}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {getSeverityBadge(data.severity)}
        {getStatusBadge(data.status)}
      </div>

      <Separator />

      {/* Description */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Descrição</h4>
        <p className="text-sm bg-muted p-3">{data.description}</p>
      </div>

      <Separator />

      {/* Details */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Agente:</span>
          <span className="font-medium">{agent?.name || data.agentId}</span>
        </div>

        {data.conversationId && (
          <div className="flex items-center gap-3 text-sm">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Conversa:</span>
            <span className="font-mono text-xs">{data.conversationId}</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Reportado por:</span>
          <span className="font-medium">{data.reportedBy}</span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Data:</span>
          <span>{data.createdAt.toLocaleString('pt-BR')}</span>
        </div>

        {data.resolvedAt && (
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-muted-foreground">Resolvido em:</span>
            <span>{data.resolvedAt.toLocaleString('pt-BR')}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Action Taken */}
      <div className="space-y-3">
        <Label>Ação Tomada</Label>
        <Textarea
          value={actionTaken}
          onChange={(e) => setActionTaken(e.target.value)}
          placeholder="Descreva a ação tomada para resolver o incidente..."
          className="min-h-[100px]"
          disabled={data.status === 'resolved'}
        />
      </div>

      {/* Actions */}
      {data.status !== 'resolved' && (
        <div className="flex gap-3">
          <Button 
            className="flex-1 bg-accent hover:bg-accent/90"
            onClick={handleResolve}
            disabled={isResolving || !actionTaken}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Marcar como Resolvido
          </Button>
        </div>
      )}
    </div>
  );
}
