import { MessageSquare, Phone, Bot, User } from 'lucide-react';
import { Conversation } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  return (
    <div className="h-full flex flex-col border-r border-border">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border bg-muted/30">
        <h2 className="font-semibold">Conversas</h2>
        <Badge variant="secondary">{conversations.length}</Badge>
      </div>
      
      {/* Search */}
      <div className="p-3 border-b border-border">
        <input
          type="text"
          placeholder="Buscar conversas..."
          className="w-full px-3 py-2 bg-muted border-0 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              'conversation-item',
              selectedId === conv.id && 'active'
            )}
            onClick={() => onSelect(conv)}
          >
            {/* Avatar */}
            <div className="relative">
              <div className="w-12 h-12 bg-muted flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              {/* Status indicator */}
              <div className={cn(
                'absolute -bottom-0.5 -right-0.5 w-4 h-4 border-2 border-card flex items-center justify-center',
                conv.status === 'ai_active' ? 'bg-accent' : 'bg-success'
              )}>
                {conv.status === 'ai_active' ? (
                  <Bot className="h-2.5 w-2.5 text-accent-foreground" />
                ) : (
                  <User className="h-2.5 w-2.5 text-success-foreground" />
                )}
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium truncate">{conv.userName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(conv.lastMessageTime, { addSuffix: false, locale: ptBR })}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {conv.channel === 'voice' ? (
                  <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                ) : (
                  <MessageSquare className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}
                <p className="text-sm text-muted-foreground truncate flex-1">
                  {conv.lastMessage}
                </p>
                {conv.unreadCount > 0 && (
                  <Badge className="bg-accent text-accent-foreground text-xs px-1.5 min-w-[20px] flex items-center justify-center">
                    {conv.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
