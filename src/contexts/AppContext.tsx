import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant, Conversation, mockUsers, mockTenants, mockConversations } from '@/lib/mock-data';

interface AppContextType {
  // Theme
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  
  // User & Auth
  currentUser: User | null;
  currentTenant: Tenant | null;
  
  // Conversations
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  setSelectedConversation: (conv: Conversation | null) => void;
  
  // Slide over panel
  slideOverOpen: boolean;
  slideOverContent: 'conversation-details' | 'agent-config' | 'consumption-details' | null;
  slideOverData: any;
  openSlideOver: (content: 'conversation-details' | 'agent-config' | 'consumption-details', data?: any) => void;
  closeSlideOver: () => void;
  
  // Conversation actions
  takeOverConversation: (conversationId: string) => void;
  returnToAI: (conversationId: string) => void;
  transferConversation: (conversationId: string, operatorId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUser] = useState<User>(mockUsers[2]); // Pedro Santos - Operator
  const [currentTenant] = useState<Tenant>(mockTenants[0]); // Banco Digital Alpha
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [slideOverContent, setSlideOverContent] = useState<'conversation-details' | 'agent-config' | 'consumption-details' | null>(null);
  const [slideOverData, setSlideOverData] = useState<any>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const openSlideOver = (content: 'conversation-details' | 'agent-config' | 'consumption-details', data?: any) => {
    setSlideOverContent(content);
    setSlideOverData(data);
    setSlideOverOpen(true);
  };

  const closeSlideOver = () => {
    setSlideOverOpen(false);
    setTimeout(() => {
      setSlideOverContent(null);
      setSlideOverData(null);
    }, 300);
  };

  const takeOverConversation = (conversationId: string) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? {
              ...conv,
              status: 'human_active' as const,
              assignedOperator: currentUser.name,
              messages: [
                ...conv.messages,
                {
                  id: `${conv.id}-takeover-${Date.now()}`,
                  conversationId,
                  content: `🔄 ${currentUser.name} assumiu a conversa`,
                  type: 'text' as const,
                  sender: 'ai' as const,
                  timestamp: new Date(),
                },
              ],
            }
          : conv
      )
    );
    
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation(prev => prev ? {
        ...prev,
        status: 'human_active',
        assignedOperator: currentUser.name,
      } : null);
    }
  };

  const returnToAI = (conversationId: string) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? {
              ...conv,
              status: 'ai_active' as const,
              assignedOperator: undefined,
              messages: [
                ...conv.messages,
                {
                  id: `${conv.id}-return-${Date.now()}`,
                  conversationId,
                  content: '🤖 IA retomou o atendimento',
                  type: 'text' as const,
                  sender: 'ai' as const,
                  timestamp: new Date(),
                },
              ],
            }
          : conv
      )
    );
    
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation(prev => prev ? {
        ...prev,
        status: 'ai_active',
        assignedOperator: undefined,
      } : null);
    }
  };

  const transferConversation = (conversationId: string, operatorName: string) => {
    const previousOperator = conversations.find(c => c.id === conversationId)?.assignedOperator || 'IA';
    
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? {
              ...conv,
              assignedOperator: operatorName,
              messages: [
                ...conv.messages,
                {
                  id: `${conv.id}-transfer-${Date.now()}`,
                  conversationId,
                  content: `🔀 Conversa transferida de ${previousOperator} para ${operatorName}`,
                  type: 'text' as const,
                  sender: 'ai' as const,
                  timestamp: new Date(),
                },
              ],
            }
          : conv
      )
    );
  };

  return (
    <AppContext.Provider
      value={{
        isDarkMode,
        toggleDarkMode,
        currentUser,
        currentTenant,
        conversations,
        selectedConversation,
        setSelectedConversation,
        slideOverOpen,
        slideOverContent,
        slideOverData,
        openSlideOver,
        closeSlideOver,
        takeOverConversation,
        returnToAI,
        transferConversation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
