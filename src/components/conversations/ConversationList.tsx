import { useState, useMemo } from 'react';
import { MessageSquare, Phone, Bot, User, Filter, X } from 'lucide-react';
import { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  searchTerm: string;
  onSearchChange: (temp: string) => void;
}

export function ConversationList({ conversations, selectedId, onSelect, searchTerm, onSearchChange }: ConversationListProps) {
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  // 1. Extract Unique Agents for Filter
  const uniqueAgents = useMemo(() => {
    const agents = new Set(conversations.map(c => c.agentName).filter(Boolean));
    return Array.from(agents).sort();
  }, [conversations]);

  // 2. Filter Logic
  // 2. Filter Logic
  const filteredConversations = useMemo(() => {
    if (!searchTerm) {
      return agentFilter
        ? conversations.filter(c => c.agentName === agentFilter)
        : conversations;
    }

    const term = searchTerm.toLowerCase();

    return conversations.filter(c => {
      const matchesAgent = agentFilter ? c.agentName === agentFilter : true;
      if (!matchesAgent) return false;

      // Check User Name
      if (c.userName.toLowerCase().includes(term)) return true;

      // Check Last Message
      if (c.lastMessage.toLowerCase().includes(term)) return true;

      // Check Content in ALL messages history
      const hasMessageMatch = c.messages.some(m => {
        const contentMatch = m.content?.toLowerCase().includes(term);
        const transMatch = m.transcription?.toLowerCase().includes(term);
        return contentMatch || transMatch;
      });

      return hasMessageMatch;
    });
  }, [conversations, searchTerm, agentFilter]);

  const totalMessages = useMemo(() => {
    return filteredConversations.reduce((acc, curr) => acc + (curr.messages?.length || 0), 0);
  }, [filteredConversations]);

  return (
    <div className="h-full flex flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm uppercase tracking-wide">Conversas</h2>
          <Badge variant="outline" className="text-xs h-5 px-1.5">{filteredConversations.length}</Badge>

          <div className="w-px h-3 bg-border mx-1" />

          <div className="flex items-center gap-1.5 text-muted-foreground" title="Total de mensagens">
            <MessageSquare className="h-4 w-4" />
            <Badge variant="outline" className="text-xs h-5 px-1.5 text-black border-muted-foreground/20">{totalMessages}</Badge>
          </div>
        </div>

        {/* Filter Action */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={cn("h-8 w-8", agentFilter && "text-accent bg-accent/10")}>
              <Filter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filtrar por Agente</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={agentFilter === null}
              onCheckedChange={() => setAgentFilter(null)}
            >
              Todos os Agentes
            </DropdownMenuCheckboxItem>
            {uniqueAgents.map(agent => (
              <DropdownMenuCheckboxItem
                key={agent}
                checked={agentFilter === agent}
                onCheckedChange={() => setAgentFilter(agent as string)}
              >
                {agent}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por nome ou mensagem..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-3 pr-8 py-2 bg-muted/50 border border-transparent focus:border-accent rounded-md text-sm focus:outline-none transition-all placeholder:text-muted-foreground/50"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma conversa encontrada.
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'group relative p-4 border-b border-border/50 cursor-pointer transition-all hover:bg-muted/30',
                selectedId === conv.id ? 'bg-muted/50 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'
              )}
              onClick={() => onSelect(conv)}
            >
              <div className="flex gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center overflow-hidden border border-border">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  {/* Status indicator */}
                  <div className={cn(
                    'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card',
                    conv.status === 'ai_active' ? 'bg-accent' :
                      conv.status === 'closed' ? 'bg-muted-foreground' : 'bg-success'
                  )} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex flex-col min-w-0">
                      <span className={cn("font-medium truncate", selectedId === conv.id && "text-accent")}>{conv.userName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{conv.userId}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {formatDistanceToNow(conv.lastMessageTime, { addSuffix: false, locale: ptBR })}
                    </span>
                  </div>

                  {/* Agent Info Badge */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Badge variant="secondary" className="h-4 px-1 rounded-[2px] text-[9px] font-normal gap-1 bg-muted text-muted-foreground group-hover:bg-background/80">
                      <Bot className="h-2.5 w-2.5" />
                      {conv.agentName || 'Agente'}
                    </Badge>
                    {conv.status === 'closed' && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] font-medium bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-transparent hover:bg-gray-300 dark:hover:bg-gray-700"
                      >
                        Fechada
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                    <div className="flex-1 truncate flex items-center gap-1.5">
                      {conv.channel === 'voice' ? (
                        <Phone className="h-3 w-3" />
                      ) : (
                        <MessageSquare className="h-3 w-3" />
                      )}
                      <span className="truncate">{conv.lastMessage}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div >
  );
}
