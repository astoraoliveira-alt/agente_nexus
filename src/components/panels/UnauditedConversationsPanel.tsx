import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User, Calendar, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface UnauditedConversationsPanelProps {
    data: any[]; // List of conversations from API
}

export function UnauditedConversationsPanel({ data }: UnauditedConversationsPanelProps) {
    if (!data || data.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                <p>Nenhuma conversa pendente de auditoria.</p>
            </div>
        );
    }

    return (
        <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight">Pendências de Auditoria</h3>
                    <p className="text-sm text-muted-foreground">
                        Estas conversas foram encerradas mas ainda não possuem avaliação de qualidade registrada.
                    </p>
                </div>

                <div className="space-y-4">
                    {data.map((conv, index) => (
                        <div key={conv.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">{conv.agent_name || 'Agente'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                        {conv.status}
                                    </Badge>
                                    {conv.compliance_score !== undefined && (
                                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold">
                                            Score: {conv.compliance_score}
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">
                                    {conv.user_name || conv.user_identifier || 'Usuário Desconhecido'}
                                </span>
                                {conv.user_identifier && conv.user_identifier !== conv.user_name && (
                                    <span className="text-xs text-muted-foreground">({conv.user_identifier})</span>
                                )}
                            </div>

                            <Separator className="my-2" />

                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    <span>
                                        {conv.ended_at
                                            ? formatDistanceToNow(new Date(conv.ended_at), { addSuffix: true, locale: ptBR })
                                            : 'Data desconhecida'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" />
                                    <span className="uppercase text-[10px] tracking-wider">ID: {conv.id.slice(0, 8)}...</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </ScrollArea>
    );
}
