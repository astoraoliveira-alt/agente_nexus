import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ConversationList } from '@/components/conversations/ConversationList';
import { ChatArea } from '@/components/conversations/ChatArea';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';

export default function Conversations() {
  const { conversations, selectedConversation, setSelectedConversation, setConversations, fetchMessages } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const handledParamRef = useRef<string | null>(null);

  const handleSelect = (conv: any) => {
    const cached = conversations.find(c => c.id === conv.id);
    const existingMessages = (cached?.messages && cached.messages.length > 0)
      ? cached.messages
      : (selectedConversation?.id === conv.id && selectedConversation.messages?.length)
        ? selectedConversation.messages
        : conv.messages || [];

    const fullConv = { ...conv, messages: existingMessages };

    setConversations(prev => {
      if (prev.some(c => c.id === conv.id)) {
        return prev.map(c => c.id === conv.id ? { ...c, ...fullConv, messages: existingMessages } : c);
      }
      return [fullConv, ...prev];
    });

    setSelectedConversation(fullConv);
    fetchMessages(conv.id, true);
  };

  // Suporte a abertura direta de conversa via URL params (?id=... ou ?phone=...)
  useEffect(() => {
    const targetId = searchParams.get('id') || searchParams.get('conversationId');
    const targetPhone = searchParams.get('phone');
    const paramKey = `${targetId || ''}:${targetPhone || ''}`;

    if ((targetId || targetPhone) && handledParamRef.current !== paramKey) {
      handledParamRef.current = paramKey;

      const resolveAndSelect = async () => {
        // 1. Procurar nas conversas já carregadas na lista
        let found = conversations.find(c => {
          if (targetId && c.id === targetId) return true;
          if (targetPhone) {
            const cleanTarget = targetPhone.replace(/\D/g, '');
            const cleanUser = String(c.userId || '').replace(/\D/g, '');
            return cleanUser.includes(cleanTarget) || cleanTarget.includes(cleanUser);
          }
          return false;
        });

        // 2. Se não estiver na lista em memória, buscar do banco de dados pelo ID
        if (!found && targetId) {
          try {
            const conv = await api.getConversationById(targetId);
            if (conv) {
              found = conv;
            }
          } catch (e) {
            console.warn('Erro ao carregar conversa por ID via param:', e);
          }
        }

        if (found) {
          handleSelect(found);
        } else if (targetPhone) {
          // Se não encontrou a conversa mas veio o telefone, pré-popula a busca para o operador
          setSearchTerm(targetPhone);
        }
      };

      resolveAndSelect();
    }
  }, [searchParams, conversations]);

  return (
    <MainLayout>
      <div className="h-full flex relative">
        {/* Conversation List */}
        <div className={cn(
          "flex-shrink-0 transition-all duration-300 ease-in-out",
          isListCollapsed ? "w-0 overflow-hidden" : "w-[22rem]"
        )}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelect}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
        </div>

        {/* Collapse Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-12 w-6 bg-muted hover:bg-muted/80 border border-border"
          style={{ left: isListCollapsed ? 0 : '21rem' }}
          onClick={() => setIsListCollapsed(!isListCollapsed)}
        >
          {isListCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>

        {/* Chat Area */}
        <ChatArea
          conversation={selectedConversation}
          highlightTerm={searchTerm}
        />
      </div>
    </MainLayout>
  );
}
