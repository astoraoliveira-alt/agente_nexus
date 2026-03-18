import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant, Conversation } from '@/lib/types'; // Using real types
import { api } from '@/services/api';
import { AuthService } from '@/services/auth';
import { supabase } from '@/lib/supabase';

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
  | 'financial-detail'
  | 'unaudited-list'
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

  // Privacy
  maskingEnabled: boolean;
  toggleMasking: () => void;

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
  isLoading: boolean;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]); // Initialize empty, load on effect
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [slideOverContent, setSlideOverContent] = useState<SlideOverContentType | null>(null);
  const [slideOverData, setSlideOverData] = useState<any>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [maskingEnabled, setMaskingEnabled] = useState(true); // Default to true for safety

  const toggleMasking = () => setMaskingEnabled(prev => !prev);

  // Initialize user from Supabase Auth + Public Users Table
  useEffect(() => {
    async function boot() {
      try {
        console.log('🔄 Booting App Context...');

        // 1. Check Supabase Session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          console.log('🔐 Supabase Session Found:', session.user.email);
          const { user: authUser } = session;

          // 2. Fetch Business Profile via Service Layer
          let businessUser = await AuthService.getUserByProviderId(authUser.id);

          // 3. Auto-Link Logic (Legacy or Invite Support)
          if (!businessUser && authUser.email) {
            console.log('⚠️ User not linked. Attempting check by email...');
            const existingUser = await AuthService.getUserByEmail(authUser.email);

            if (existingUser && !existingUser.provider_id) {
              console.log('🔗 Auto-linking existing invite/legacy user...');
              businessUser = await AuthService.linkProviderToUser(authUser.email, authUser.id);
            } else if (!existingUser) {
              // New Registration logic will be handled by Login/Register page
              // But if we are here, it might be a raw sign-up. 
              // For now, we let valid session stay, but currentUser will be null -> Redirect to pending?
              console.warn('❌ User has auth session but no business record.');
            }
          }

          if (businessUser) {
            console.log('👤 Business Profile Loaded:', businessUser);
            setCurrentUser(businessUser);

            // 4. Permission Logic
            if (businessUser.role === 'super_admin' || businessUser.role === 'tenant_admin') {
              setUserPermissions(['all']);
            } else {
              setUserPermissions(['view_only']);
            }

            // 5. Tenant Logic
            const savedTenantId = localStorage.getItem('davos_active_tenant_id');
            // Prefer saved tenant if valid. 
            // For Super Admin, if NO saved tenant, we don't force a fallback yet, let them choose.
            // For others, we fallback to their home tenantId.
            const tenantIdToLoad = savedTenantId || (businessUser.role === 'super_admin' ? null : businessUser.tenantId);

            if (tenantIdToLoad) {
              const tenant = await api.getTenant(tenantIdToLoad);
              if (tenant) setCurrentTenant(tenant);
            }
          }
        } else {
          console.log('👋 No active session.');
          localStorage.removeItem('davos_session'); // Clear stale session if exists
          await supabase.auth.signOut().catch(() => { }); // Force wipe supabase dirty tokens
        }
      } catch (err) {
        console.error('❌ Boot Error:', err);
        localStorage.removeItem('davos_session'); // Safety clear
        await supabase.auth.signOut().catch(() => { }); // Force wipe supabase dirty tokens
      } finally {
        setIsLoading(false);
      }
    }

    // Listen for Auth Changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Trigger boot/reload if needed, or let the boot effect handle it on mount
        // For simplicity, we depend on component mount usually, but we can force reload logic here if needed.
      }
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setCurrentTenant(null);
        localStorage.removeItem('davos_session');
      }
    });

    boot();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Filter data when tenant changes & Poll every 5s
  // Filter data when tenant changes & Poll every 5s
  useEffect(() => {


    async function loadConversationsList() {
      if (currentTenant) {
        try {
          const tenantConversations = await api.getConversationsOverview(currentTenant.id);

          setConversations(prev => {
            // Merge strategy: Keep existing messages if ID matches, only update metadata

            // 1. Check if we actually need to update (Simple length + ID check for performance)
            // In a real app, use a deep comparison or JSON.stringify if needed, but this is a good heuristic.
            const hasChanges = tenantConversations.length !== prev.length ||
              tenantConversations.some(c => {
                const p = prev.find(old => old.id === c.id);
                return !p || p.lastMessageTime !== c.lastMessageTime || p.status !== c.status;
              });

            if (!hasChanges) return prev;

            return tenantConversations.map(newConv => {
              const existing = prev.find(p => p.id === newConv.id);
              return {
                ...newConv,
                messages: existing ? existing.messages : [] // Persist loaded messages or empty
              };
            });
          });

        } catch (error) {
          console.error("Failed to load conversations:", error);
        }
      }
    }

    // Initial Load & Polling (Relaxed to 20s to prevent thrashing)
    loadConversationsList();
    const intervalId = setInterval(loadConversationsList, 20000);

    return () => clearInterval(intervalId);
  }, [currentTenant]);

  // Separate Effect: Fetch Messages ONLY when Selected Conversation Changes
  useEffect(() => {
    async function fetchMessages() {
      if (selectedConversation?.id) {
        // Optimistic check: If we already have recent messages, maybe skip? 
        // For now, always fetch to ensure sync.
        try {
          console.log(`📡 Fetching messages for ${selectedConversation.id}...`);
          const messages = await api.getConversationMessages(selectedConversation.id);

          // Update selected conversation state with real messages
          setSelectedConversation(prev => prev ? { ...prev, messages } : null);

          // Update main list state as well to cache it
          setConversations(prev =>
            prev.map(c => c.id === selectedConversation.id ? { ...c, messages: messages } : c)
          );

        } catch (error) {
          console.error("Failed to fetch messages:", error);
        }
      }
    }

    fetchMessages();

    // Relaxed to 5s for active chat
    const msgInterval = setInterval(fetchMessages, 5000);
    return () => clearInterval(msgInterval);

  }, [selectedConversation?.id]);


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
    localStorage.setItem('davos_active_tenant_id', tenantId);
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
      const conv = conversations.find(c => c.id === conversationId);
      await api.triggerAudit(conversationId, {
        tenantId: conv?.tenantId || currentTenant.id,
        agentId: conv?.agentId
      });
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
        isLoading,
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
        maskingEnabled,
        toggleMasking,
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
