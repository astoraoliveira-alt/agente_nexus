import { User, Bot, MessageSquare, Clock, Phone, ShieldCheck, AlertTriangle, Play, ThumbsUp, Loader2, TrendingUp, TrendingDown, Minus, Hourglass } from 'lucide-react';
import { Conversation } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from '@/components/ui/use-toast';

interface ConversationDetailsPanelProps {
  data: Conversation;
}

export function ConversationDetailsPanel({ data }: ConversationDetailsPanelProps) {
  const queryClient = useQueryClient();
  const [isAuditing, setIsAuditing] = useState(false);

  const { data: evaluations, isLoading, isError } = useQuery({
    queryKey: ['evaluation-history', data.id],
    queryFn: () => api.getEvaluationHistory(data.id),
    enabled: !!data.id
  });

  const evaluation = evaluations?.[0]; // Latest one
  const history = evaluations?.slice(1) || []; // Previous ones

  const handleAuditRequest = async () => {
    setIsAuditing(true);
    try {
      const success = await api.triggerAudit(data.id, {
        tenantId: data.tenantId,
        agentId: data.agentId
      });
      if (success) {
        toast({
          title: "Auditoria solicitada",
          description: "A IA está analisando a conversa. O resultado aparecerá em breve.",
        });
        // Invalidate to refetch (user can refresh manually or we could poll)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['evaluation-history', data.id] });
        }, 5000); // Wait 5s for N8N to process
      } else {
        throw new Error("Failed to trigger webhook");
      }
    } catch (error) {
      toast({
        title: "Erro na solicitação",
        description: "Não foi possível iniciar a auditoria. Verifique a conexão com o N8N.",
        variant: "destructive"
      });
    } finally {
      setIsAuditing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (score >= 50) return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    return 'bg-red-500/10 text-red-600 border-red-500/20';
  };

  const getTrendIcon = (current: number, previous?: number) => {
    if (previous === undefined) return null;
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-yellow-500" />;
  };

  if (!data) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          Detalhes da Conversa
        </h2>
      </div>

      <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 mt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <ShieldCheck className="h-3 w-3" />
              Auditoria
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="overview" className="p-6 space-y-6 m-0">
            {/* User Info */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Usuário</h3>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{data.userName}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">ID: {data.userId}</p>
                  {data.userId.includes('+') || data.userId.length > 8 ? (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{data.userId}</span>
                    </div>
                  ) : null}
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
                  <p className="font-medium">{data.agentName || 'Agente de Atendimento'}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">ID: {data.agentId}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Metadata */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Metadados</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="w-4 flex justify-center uppercase font-bold text-[9px] border border-muted-foreground/30 rounded px-0.5">ID</span>
                  <span className="font-mono text-[10px] truncate">{data.id}</span>
                </div>

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
          </TabsContent>

          <TabsContent value="audit" className="p-6 m-0 animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Buscando auditoria...</p>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center h-40 text-destructive gap-2">
                <AlertTriangle className="h-6 w-6" />
                <p className="text-sm">Erro ao carregar auditoria.</p>
              </div>
            ) : !evaluation ? (
              <div className="flex flex-col items-center justify-center pt-10 text-muted-foreground gap-4 text-center">
                <div className="bg-muted p-4 rounded-full">
                  {data.status === 'closed' ? (
                    <Hourglass className="h-8 w-8 text-amber-500/70 animate-pulse" />
                  ) : (
                    <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <div>
                  {data.status === 'closed' ? (
                    <>
                      <p className="font-medium text-amber-600 dark:text-amber-500">Auditoria na Fila</p>
                      <p className="text-xs max-w-[250px] mt-1">A auditoria desta conversa está na fila e será gerada automaticamente em breve. Isso pode demorar alguns minutos.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Nenhuma auditoria encontrada</p>
                      <p className="text-xs max-w-[200px] mt-1">Esta conversa ainda não foi auditada pela IA.</p>
                    </>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleAuditRequest}
                  disabled={isAuditing}
                >
                  {isAuditing ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Solicitando...
                    </>
                  ) : (
                    "Solicitar Auditoria Manual"
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall Score */}
                <Card className={`border-border ${getScoreColor(evaluation.score)}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        Compliance Score
                        {getTrendIcon(evaluation.score, evaluations?.[1]?.score)}
                      </h3>
                      <Badge variant="outline" className={`text-lg px-3 py-1 ${getScoreColor(evaluation.score)}`}>
                        {evaluation.score}/100
                      </Badge>
                    </div>
                    <Progress value={evaluation.score} className="h-2" />
                  </CardContent>
                </Card>

                {/* Qualitative Summary */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Parecer do Auditor (IA)</h3>
                  <div className="bg-muted p-4 rounded-md text-sm leading-relaxed border border-border">
                    "{evaluation.summary}"
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {evaluation.tags?.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] uppercase">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Detailed Criteria */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Detalhamento dos Critérios</h3>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Empatia & Tom de Voz</span>
                        <span className="font-bold">{evaluation.criteriaResults?.empathy || 0}/5</span>
                      </div>
                      <Progress value={((evaluation.criteriaResults?.empathy || 0) / 5) * 100} className="h-1.5" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Eficiência na Resolução</span>
                        <span className="font-bold">{evaluation.criteriaResults?.efficiency || 0}/5</span>
                      </div>
                      <Progress value={((evaluation.criteriaResults?.efficiency || 0) / 5) * 100} className="h-1.5 bg-muted [&>div]:bg-yellow-500" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Segurança & Compliance</span>
                        <span className="font-bold">{evaluation.criteriaResults?.compliance || 0}/5</span>
                      </div>
                      <Progress value={((evaluation.criteriaResults?.compliance || 0) / 5) * 100} className="h-1.5" />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot className="h-3 w-3" />
                  Auditado por {evaluation.aiModel} • {formatDistanceToNow(new Date(evaluation.createdAt), { addSuffix: true, locale: ptBR })}
                </div>

                {/* History Section */}
                {history.length > 0 && (
                  <div className="mt-8 space-y-4 pb-4">
                    <Separator />
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 pt-2">
                      <Clock className="h-4 w-4" />
                      Histórico de Auditorias
                    </h3>
                    <div className="space-y-3">
                      {history.map((h, idx) => (
                        <div key={h.id} className="bg-muted/30 border border-border p-3 rounded-lg flex justify-between items-start gap-3 text-sm animate-in slide-in-from-bottom-2 duration-300">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getTrendIcon(h.score, evaluations?.[idx + 2]?.score)}
                              <p className="line-clamp-2 italic text-muted-foreground font-serif">"{h.summary}"</p>
                            </div>
                            <p className="text-[10px] mt-2 text-muted-foreground uppercase tracking-wider">
                              {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                          <Badge variant="outline" className={`shrink-0 font-mono ${getScoreColor(h.score)}`}>
                            {h.score}/100
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
