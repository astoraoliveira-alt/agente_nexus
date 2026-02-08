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
  | 'agent-playground'
  | 'evaluation-details'
  | 'iso-report'
  | 'contact-details'
  | 'plan-history'
  | 'agent-history'
  | null;

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
  closeConversation: (conversationId: string) => void;
  transferConversation: (conversationId: string, operatorId: string) => void;
  sendMessage: (conversationId: string, content: string, type?: 'text' | 'image' | 'audio') => Promise<void>;
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

  // Filter data when tenant changes & Poll every 5s
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    async function loadConversations() {
      if (currentTenant) {
        try {
          const tenantConversations = await api.getConversations(currentTenant.id);
          setConversations(tenantConversations);

          // If selected conversation is not in this tenant, deselect it
          // Note: We don't want to deselect if it's just a refresh, only if tenant changed strictly.
          // But strict tenant isolation is handled by the API query eq('tenant_id').
          // Simpler: If selected exists but isn't found in new list (e.g. deleted), handle it.
          // For now, we keep the simple check.
          if (selectedConversation && selectedConversation.tenantId !== currentTenant.id) {
            setSelectedConversation(null);
          } else if (selectedConversation) {
            // Update the selected conversation object in place with new messages
            const updated = tenantConversations.find(c => c.id === selectedConversation.id);
            if (updated) {
              // Only update if there are changes (e.g. message count) to avoid re-renders?
              // React SetState is somewhat smart, but let's just update to be sure we get new messages.
              setSelectedConversation(updated);
            }
          }

        } catch (error) {
          console.error("Failed to load conversations:", error);
        }
      }
    }

    // Initial Load
    loadConversations();

    // Polling
    intervalId = setInterval(loadConversations, 5000);

    return () => clearInterval(intervalId);
  }, [currentTenant, selectedConversation?.id]); // Dep on ID, not full obj, to avoid loop


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
                sender: 'ai' as const, // System message usually from AI/System
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
      // Pass operatorName for Audit Log
      await api.assignConversation(conversationId, currentUser.id, currentUser.name);
      // System message
      await api.sendMessage(conversationId, `🔄 ${currentUser.name} assumiu a conversa`, 'ai');
    } catch (error) {
      console.error(error);
      // In real app, revert state here
    }
  };

  const returnToAI = async (conversationId: string) => {
    if (!currentTenant || !currentUser) return;

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
      // Pass currentUser.name as the 'actor' for the audit log (even though operatorId is null for the assignment target)
      // We need to slightly trick the API or update calls.
      // api.assignConversation(id, null, actorName) -> actorName used for log.
      await api.assignConversation(conversationId, null, currentUser.name);
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

  const closeConversation = async (conversationId: string) => {
    if (!currentTenant) return;

    // Optimistic UI Update
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? { ...conv, status: 'closed' as const }
          : conv
      )
    );

    if (selectedConversation?.id === conversationId) {
      setSelectedConversation(prev => prev ? { ...prev, status: 'closed' } : null);
    }

    try {
      await api.closeConversation(conversationId);
      // 🔥 Automate Quality Audit Trigger
      await api.triggerAudit(conversationId);
    } catch (error) {
      console.error(error);
    }
  };

  const sendMessage = async (conversationId: string, content: string, type: 'text' | 'image' | 'audio' = 'text') => {
    if (!currentUser || !currentTenant) return;

    // 1. Optimistic Update
    const tempId = `temp-${Date.now()}`;
    const newMessage = {
      id: tempId,
      conversationId,
      tenantId: currentTenant.id,
      tenantSlug: currentTenant.slug,
      content,
      type,
      sender: 'human' as const, // Always human when sending from UI
      senderName: currentUser.name,
      timestamp: new Date()
    };

    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? {
            ...conv,
            lastMessage: type === 'text' ? content : 'Anexo enviado',
            lastMessageTime: new Date(),
            messages: [...conv.messages, newMessage]
          }
          : conv
      )
    );

    // Also update selected if applicable
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, newMessage]
      } : null);
    }

    // 2. API Call
    try {
      await api.sendMessage(conversationId, content, 'human', currentUser.name, type);
    } catch (error) {
      console.error("Message send failed:", error);
      // Revert optimistic update (simplified)
      // logic to remove message would go here
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
        closeConversation,
        transferConversation,
        switchTenant,
        sendMessage,
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
