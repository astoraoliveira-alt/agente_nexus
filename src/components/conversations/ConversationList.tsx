import { useState, useMemo, useEffect, useRef } from 'react';
import { MessageSquare, Phone, Bot, User, Filter, X, Smartphone, AlertTriangle, Building2, Loader2 } from 'lucide-react';
import { Conversation } from '@/lib/types';
import { cn, phoneticMatch } from '@/lib/utils';
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
import { useApp } from "@/contexts/AppContext";
import { maskSensitiveData } from "@/lib/masking";
import { coreService } from "@/services/core.service";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  searchTerm: string;
  onSearchChange: (temp: string) => void;
}

export function ConversationList({ conversations, selectedId, onSelect, searchTerm, onSearchChange }: ConversationListProps) {
  const { maskingEnabled, currentTenant } = useApp();
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [remoteResults, setRemoteResults] = useState<Conversation[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Extract Unique Agents for Filter
  const uniqueAgents = useMemo(() => {
    const agents = new Set(conversations.map(c => c.agentName).filter(Boolean));
    return Array.from(agents).sort();
  }, [conversations]);

  // 2. Debounced backend search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const q = searchTerm.trim();

    // Clear remote results when search is short
    if (q.length < 3) {
      setRemoteResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        if (!currentTenant?.id) return;
        const results = await coreService.searchConversations(currentTenant.id, q);
        setRemoteResults(results);
      } catch (err) {
        console.error('[ConversationList] Backend search error:', err);
        setRemoteResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchTerm, currentTenant?.id]);

  // 3. Filter & Sort Logic — merges local + remote results
  const filteredConversations = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    // No search → apply only agent filter
    if (!q) {
      const result = agentFilter
        ? conversations.filter(c => c.agentName === agentFilter)
        : conversations;
      return [...result].sort((a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );
    }

    // Local fast filter (instant, no network)
    const phoneClean = q.replace(/\D/g, '');
    const localMatches = conversations.filter(c => {
      if (agentFilter && c.agentName !== agentFilter) return false;
      const name = (c.userName || '').toLowerCase();
      const establishment = (c.establishmentName || '').toLowerCase();
      const phone = (c.userId || '').replace(/\D/g, '');
      const lastMsg = (c.lastMessage || '').toLowerCase();

      if (name.includes(q)) return true;
      if (establishment.includes(q)) return true;
      if (lastMsg.includes(q)) return true;
      if (phoneClean && phone.includes(phoneClean)) return true;
      if (phoneticMatch(c.userName, searchTerm)) return true;
      if (phoneticMatch(c.establishmentName || '', searchTerm)) return true;
      return false;
    });

    // Merge with backend results (dedup by id, local takes precedence)
    const merged = [...localMatches];
    if (remoteResults && remoteResults.length > 0) {
      const existingIds = new Set(localMatches.map(c => c.id));
      const extras = remoteResults.filter(c => !existingIds.has(c.id));
      merged.push(...extras);
    }

    return merged.sort((a, b) =>
      new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );
  }, [conversations, searchTerm, agentFilter, remoteResults]);

  const totalMessages = useMemo(() => {
    return filteredConversations.reduce((acc, curr) => acc + (curr.messageCount ?? curr.messages?.length ?? 0), 0);
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
            placeholder="Nome, telefone ou mensagem..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-3 pr-8 py-2 bg-muted/50 border border-transparent focus:border-accent rounded-md text-sm focus:outline-none transition-all placeholder:text-muted-foreground/50"
          />
          {isSearching ? (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent animate-spin" />
          ) : searchTerm ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
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
                'group relative p-4 border-b border-border/50 cursor-pointer transition-all',
                // AUDIT RISK STYLING (Priority #1: Red Border Around)
                (conv.complianceScore !== undefined && conv.complianceScore < 70) || (conv.evaluation && conv.evaluation.score < 70)
                  ? "ring-2 ring-red-600 ring-inset bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)] relative z-10 border-transparent m-[1px]"
                  : conv.status !== 'closed'
                    ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border-l-[3px] border-l-emerald-500' // Active: Green Tint + Vivid Border
                    : 'hover:bg-muted/30 border-l-[3px] border-l-transparent opacity-75',          // Closed: Muted + Transparent Border

                // SELECTION STATE (Priority #2: Selection Highlight)
                selectedId === conv.id && (
                  (conv.complianceScore !== undefined && conv.complianceScore < 70) || (conv.evaluation && conv.evaluation.score < 70)
                    ? "bg-red-500/20 ring-red-600 border-red-600"
                    : conv.status !== 'closed'
                      ? 'bg-emerald-500/15 border-l-emerald-600'
                      : 'bg-muted border-l-foreground/50'
                )
              )}
              onClick={() => onSelect(conv)}
            >
              <div className="flex gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border transition-colors",
                    conv.status !== 'closed'
                      ? "bg-emerald-100 border-emerald-200 text-emerald-700"
                      : "bg-muted border-border text-muted-foreground"
                  )}>
                    <User className="h-5 w-5" />
                  </div>
                  {/* Status indicator */}
                  <div className={cn(
                    'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card shadow-sm',
                    conv.status === 'ai_active' ? 'bg-emerald-500 animate-pulse' :
                      conv.status === 'human_active' ? 'bg-blue-500' :
                        'bg-slate-400'
                  )} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 mb-2 items-start">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "font-medium truncate transition-colors",
                          conv.status !== 'closed' ? "text-emerald-950 dark:text-emerald-50" : "text-muted-foreground",
                          selectedId === conv.id && "text-foreground",
                           ((conv.complianceScore !== undefined && conv.complianceScore < 70) || (conv.evaluation && conv.evaluation.score < 70)) && "text-red-700 dark:text-red-400"
                        )}>{conv.userName}</span>
                        {((conv.complianceScore !== undefined && conv.complianceScore < 70) || (conv.evaluation && conv.evaluation.score < 70)) && (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-600 animate-pulse fill-red-600/10" />
                        )}
                        {conv.userStatus === 'banned' && (
                          <Badge variant="destructive" className="h-4 px-1 scale-75 transform origin-left uppercase">Banido</Badge>
                        )}
                      </div>

                      {conv.establishmentName ? (
                        <div className="flex items-start gap-1.5 min-w-0 text-[11px] text-foreground/80">
                          <Building2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                          <span className="leading-4 break-words line-clamp-2">
                            {conv.establishmentName}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span className="font-mono truncate">{conv.userId}</span>
                      </div>
                    </div>

                    <span className="text-[10px] text-muted-foreground flex-shrink-0 pt-0.5 text-right whitespace-nowrap">
                      {formatDistanceToNow(conv.lastMessageTime, { addSuffix: false, locale: ptBR })}
                    </span>
                  </div>

                  <div className="space-y-1.5 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {conv.status === 'closed' && (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[9px] font-medium bg-slate-100 text-slate-500 border-transparent dark:bg-slate-800 dark:text-slate-400"
                        >
                          Fechada
                        </Badge>
                      )}

                      {conv.sentiment && (() => {
                        const sentimentMap: Record<string, { label: string; emoji: string; className: string }> = {
                          interessado: {
                            label: 'Interessado',
                            emoji: '🔥',
                            className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                          },
                          neutro: {
                            label: 'Neutro',
                            emoji: '😐',
                            className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                          },
                          resistente: {
                            label: 'Resistente',
                            emoji: '🚫',
                            className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
                          },
                        };
                        const config = sentimentMap[conv.sentiment.toLowerCase()];
                        if (!config) return null;
                        return (
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-4 px-1.5 text-[9px] font-medium gap-0.5 border rounded-[2px]',
                              config.className
                            )}
                            title={`Sentimento detectado: ${config.label}`}
                          >
                            <span>{config.emoji}</span>
                            <span>{config.label}</span>
                          </Badge>
                        );
                      })()}

                      {/* Channel Badge */}
                      <Badge variant="secondary" className={cn(
                        "h-4 px-1.5 rounded-[2px] text-[9px] font-medium gap-1 border-transparent flex-shrink-0",
                        conv.channel === 'voice' ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400" :
                          conv.channel === 'whatsapp' ? "bg-[#25D366]/10 text-[#075E54] dark:bg-[#25D366]/20 dark:text-[#25D366]" :
                            "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                      )}>
                        {conv.channel === 'voice' ? <Phone className="h-2.5 w-2.5" /> : conv.channel === 'whatsapp' ? <Smartphone className="h-2.5 w-2.5" /> : <MessageSquare className="h-2.5 w-2.5" />}
                        <span>{conv.channel === 'voice' ? 'Voz' : conv.channel === 'whatsapp' ? 'WhatsApp' : 'Web'}</span>
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                      <div className="inline-flex items-center gap-1 rounded-[2px] bg-muted/40 px-1.5 py-0.5 min-w-0">
                        <Bot className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{conv.agentName || 'Agente'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                    <div className="flex-1 truncate flex items-center gap-1.5">
                      {conv.channel === 'voice' ? (
                        <Phone className="h-3 w-3" />
                      ) : conv.channel === 'whatsapp' ? (
                        <Smartphone className="h-3 w-3" />
                      ) : (
                        <MessageSquare className="h-3 w-3" />
                      )}
                      <span className="truncate group-hover:text-foreground transition-colors">{maskSensitiveData(conv.lastMessage, maskingEnabled)}</span>
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
