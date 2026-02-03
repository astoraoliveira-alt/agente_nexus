import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant, Conversation } from '@/lib/types'; // Using real types
import { api } from '@/services/api';

export type SlideOverContentType =
  | 'conversation-details'
  | 'agent-config'
  | 'consumption-details'
  | 'user-profile'
  | 'company-details'
  | 'policy-details'
  | 'incident-details'
  | 'flow-details'
  | 'decision-log-details'
  | 'agent-governance'
  | 'agent-playground';

interface AppContextType {
  // Theme
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // User & Auth
  currentUser: User | null;
  currentTenant: Tenant | null;
  userPermissions: string[];
  hasPermission: (permission: string) => boolean;

  // Conversations
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  setSelectedConversation: (conv: Conversation | null) => void;

  // Slide over panel
  slideOverOpen: boolean;
  slideOverContent: SlideOverContentType | null;
  slideOverData: any;
  openSlideOver: (content: SlideOverContentType, data?: any) => void;
  closeSlideOver: () => void;

  // Tenant switching
  switchTenant: (tenantId: string) => void;

  // Conversation actions
  takeOverConversation: (conversationId: string) => void;
  returnToAI: (conversationId: string) => void;
  transferConversation: (conversationId: string, operatorId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]); // Initialize empty, load on effect
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [slideOverContent, setSlideOverContent] = useState<SlideOverContentType | null>(null);
  const [slideOverData, setSlideOverData] = useState<any>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  // Initialize user from Database (Simulated Auth)
  useEffect(() => {
    async function boot() {
      try {
        console.log('🔄 Booting App Context...');

        let user: User | null = null;
        const session = localStorage.getItem('davos_session');

        if (session) {
          try {
            const parsed = JSON.parse(session);
            if (parsed.user?.email) {
              user = await api.getUserByEmail(parsed.user.email);
              console.log('🔓 Session Found:', user?.email);
            }
          } catch (e) {
            console.error('Invalid Session', e);
          }
        }

        // Fallback if no session or invalid session
        if (!user) {
          console.log('⚠️ No session. Fetching default Super Admin...');
          user = await api.getInitialUser();
        }

        console.log('👤 Final Bootstrap User:', user);

        if (user) {
          setCurrentUser(user);

          // 2. Fetch Tenant
          if (user.tenantId) {
            const tenant = await api.getTenant(user.tenantId);
            console.log('🏢 Tenant Fetched:', tenant);
            if (tenant) {
              setCurrentTenant(tenant);
            }
          }

          // 3. Permissions (Simple Role Mapping)
          // In real app, we would fetch role permissions from DB
          console.log('🛡️ Analyzing Role:', user.role);
          if (user.role === 'super_admin' || user.role === 'tenant_admin') {
            console.log('✅ Granting ALL permissions');
            setUserPermissions(['all']);
          } else {
            console.log('⚠️ Granting VIEW_ONLY permissions');
            setUserPermissions(['view_only']);
          }
        } else {
          console.warn('⚠️ No user found in getInitialUser()');
        }
      } catch (err) {
        console.error('❌ Boot Error:', err);
      }
    }

    boot();
  }, []);

  // Filter data when tenant changes
  useEffect(() => {
    async function loadConversations() {
      if (currentTenant) {
        try {
          const tenantConversations = await api.getConversations(currentTenant.id);
          setConversations(tenantConversations);

          // If selected conversation is not in this tenant, deselect it
          if (selectedConversation && selectedConversation.tenantId !== currentTenant.id) {
            setSelectedConversation(null);
          }
        } catch (error) {
          console.error("Failed to load conversations:", error);
        }
      }
    }
    loadConversations();
  }, [currentTenant]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const hasPermission = (permission: string): boolean => {
    // Super admin always has all permissions
    if (currentUser?.role === 'super_admin') return true;
    return userPermissions.includes(permission);
  };

  const switchTenant = async (tenantId: string) => {
    // In real app, we check if user has access to that tenant.
    const targetTenant = await api.getTenant(tenantId);
    if (!targetTenant) return;

    setCurrentTenant(targetTenant);
    console.log(`Switched to tenant: ${targetTenant.name}`);
  };

  const openSlideOver = (content: SlideOverContentType, data?: any) => {
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

  const takeOverConversation = async (conversationId: string) => {
    if (!currentUser || !currentTenant) return;

    // Optimistic UI Update
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
                tenantId: currentTenant.id,
                tenantSlug: currentTenant.slug,
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

    try {
      await api.assignConversation(conversationId, currentUser.id);
      await api.sendMessage(conversationId, `🔄 ${currentUser.name} assumiu a conversa`, 'ai');
    } catch (error) {
      console.error(error);
      // In real app, revert state here
    }
  };

  const returnToAI = async (conversationId: string) => {
    if (!currentTenant) return;

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
                tenantId: currentTenant.id,
                tenantSlug: currentTenant.slug,
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

    try {
      await api.assignConversation(conversationId, null);
      await api.sendMessage(conversationId, '🤖 IA retomou o atendimento', 'ai');
    } catch (error) {
      console.error(error);
    }
  };

  const transferConversation = async (conversationId: string, operatorName: string) => {
    if (!currentTenant) return;
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
                tenantId: currentTenant.id,
                tenantSlug: currentTenant.slug,
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

    try {
      // Ideally we need operatorId here, but for now just logging the event message
      await api.sendMessage(conversationId, `🔀 Conversa transferida de ${previousOperator} para ${operatorName}`, 'ai');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <AppContext.Provider
      value={{
        isDarkMode,
        toggleDarkMode,
        currentUser,
        currentTenant,
        userPermissions,
        hasPermission,
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
        switchTenant,
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
