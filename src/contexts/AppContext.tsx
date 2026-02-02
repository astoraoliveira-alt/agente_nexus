import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant, Conversation, mockUsers, mockTenants, mockConversations } from '@/lib/mock-data';
import { ALL_PERMISSIONS, DEFAULT_ROLES, Role } from '@/lib/types';
import { mockRoles, mockUserRoles } from '@/lib/mock-extended-data';

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

  // Initialize user from session
  useEffect(() => {
    const session = localStorage.getItem('davos_session');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        const user = mockUsers.find(u => u.id === parsed.userId);
        if (user) {
          setCurrentUser(user);
          // Initial load: prefer user's home tenant
          const tenant = mockTenants.find(t => t.id === user.tenantId);
          setCurrentTenant(tenant || mockTenants[0]);

          // Load user permissions based on role
          const userRole = mockUserRoles.find(ur => ur.userId === user.id);
          if (userRole) {
            const role = mockRoles.find(r => r.id === userRole.roleId);
            if (role) {
              setUserPermissions(role.permissions);
            }
          }
        } else {
          // Default fallback
          setCurrentUser(mockUsers[0]);
          setCurrentTenant(mockTenants[0]);
          setUserPermissions(ALL_PERMISSIONS.map(p => p.id)); // Super admin has all
        }
      } catch {
        setCurrentUser(mockUsers[0]);
        setCurrentTenant(mockTenants[0]);
        setUserPermissions(ALL_PERMISSIONS.map(p => p.id));
      }
    } else {
      // No session - use default super admin for demo
      setCurrentUser(mockUsers[0]);
      setCurrentTenant(mockTenants[0]);
      setUserPermissions(ALL_PERMISSIONS.map(p => p.id));
    }
  }, []);

  // Filter data when tenant changes
  useEffect(() => {
    if (currentTenant) {
      // Filter conversations by tenant
      const tenantConversations = mockConversations.filter(c => c.tenantId === currentTenant.id);
      setConversations(tenantConversations);

      // If selected conversation is not in this tenant, deselect it
      if (selectedConversation && selectedConversation.tenantId !== currentTenant.id) {
        setSelectedConversation(null);
      }
    }
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

  const switchTenant = (tenantId: string) => {
    // Only allow if Super Admin OR if user belongs to that tenant (simple check for now)
    // In a real app, we check if user has access to that tenant.

    const targetTenant = mockTenants.find(t => t.id === tenantId);
    if (!targetTenant) return;

    // TODO: Verify permission (skipped for demo fluidity)
    setCurrentTenant(targetTenant);

    // Toast or feedback could be here
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

  const takeOverConversation = (conversationId: string) => {
    if (!currentUser) return;

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
