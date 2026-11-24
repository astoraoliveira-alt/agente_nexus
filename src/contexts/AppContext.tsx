import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { User, Tenant, Conversation } from '@/lib/types'; // Using real types
import { api } from '@/services/api';
import { AuthService } from '@/services/auth';
import { supabase } from '@/lib/supabase';
import { getDefaultPermissionsForRole } from '@/lib/permissions';
import { salesCockpitService } from '@/services/salesCockpit.service';
import { initNotificationAudioUnlock, playNotificationSound } from '@/utils/notificationSound';
import { toast } from "sonner";

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
  refreshPermissions: () => Promise<void>;

  // Privacy
  maskingEnabled: boolean;
  toggleMasking: () => void;

  // Conversations
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  selectedConversation: Conversation | null;
  setSelectedConversation: React.Dispatch<React.SetStateAction<Conversation | null>>;

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
  sendMessage: (
    conversationId: string, 
    content: string, 
    type?: 'text' | 'image' | 'audio' | 'document',
    attachmentMeta?: { fileUrl?: string; fileName?: string; mimeType?: string }
  ) => Promise<void>;
  fetchMessages: (convIdOverride?: string, force?: boolean) => Promise<void>;
  // Handoff Requests (HITL)
  handoffRequests: any[];
  refreshHandoffs: () => Promise<void>;
  isLoading: boolean;
  awaitingReplyCount: number;
  refreshAwaitingReplyCount: () => Promise<void>;
  salesCockpitAwaitingCount: number;
  refreshSalesCockpitAwaitingCount: () => Promise<void>;
  pinnedConversationIds: string[];
  togglePinConversation: (conversationId: string) => void;
  unreadCounts: Record<string, number>;
  markConversationAsRead: (conversationId: string) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

  const hexToHslTuple = (hex: string) => {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if(max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return `${(h * 360).toFixed(2)} ${(s * 100).toFixed(2)}% ${(l * 100).toFixed(2)}%`;
  };

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
  const [handoffRequests, setHandoffRequests] = useState<any[]>([]);
  const [awaitingReplyCount, setAwaitingReplyCount] = useState<number>(0);
  const [salesCockpitAwaitingCount, setSalesCockpitAwaitingCount] = useState<number>(0);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const countedUnreadMsgIdsRef = useRef<Set<string>>(new Set());

  const pinStorageKey = currentTenant?.id
    ? `davos_pinned_conversations_${currentTenant.id}_${currentUser?.id || 'anon'}`
    : null;
  const unreadStorageKey = currentTenant?.id
    ? `davos_unread_counts_${currentTenant.id}_${currentUser?.id || 'anon'}`
    : null;

  useEffect(() => {
    if (!unreadStorageKey) {
      setUnreadCounts({});
      return;
    }
    try {
      const raw = localStorage.getItem(unreadStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setUnreadCounts(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setUnreadCounts({});
    }
  }, [unreadStorageKey]);

  const markConversationAsRead = useCallback((conversationId: string) => {
    if (!conversationId) return;
    setUnreadCounts(prev => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      if (unreadStorageKey) {
        try {
          localStorage.setItem(unreadStorageKey, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, [unreadStorageKey]);

  const recordUnreadMessages = useCallback((conversationId: string, msgIds: string[]) => {
    if (!conversationId || msgIds.length === 0) return;
    // Se a conversa está aberta na tela e o navegador está visível/em foco, não acumula como não lida
    const isCurrentlyViewing = selectedConvIdRef.current === conversationId && typeof document !== 'undefined' && !document.hidden;
    if (isCurrentlyViewing) return;

    let added = 0;
    for (const id of msgIds) {
      if (!id) continue;
      if (!countedUnreadMsgIdsRef.current.has(id)) {
        countedUnreadMsgIdsRef.current.add(id);
        added++;
      }
    }
    if (countedUnreadMsgIdsRef.current.size > 1000) {
      const first = countedUnreadMsgIdsRef.current.values().next().value;
      if (first) countedUnreadMsgIdsRef.current.delete(first);
    }
    if (added === 0) return;

    setUnreadCounts(prev => {
      const next = { ...prev, [conversationId]: (prev[conversationId] || 0) + added };
      if (unreadStorageKey) {
        try {
          localStorage.setItem(unreadStorageKey, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, [unreadStorageKey]);

  useEffect(() => {
    if (!pinStorageKey) {
      setPinnedConversationIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(pinStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setPinnedConversationIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPinnedConversationIds([]);
    }
  }, [pinStorageKey]);

  const togglePinConversation = useCallback((conversationId: string) => {
    if (!conversationId) return;
    setPinnedConversationIds(prev => {
      const exists = prev.includes(conversationId);
      const next = exists ? prev.filter(id => id !== conversationId) : [conversationId, ...prev];
      if (pinStorageKey) {
        try {
          localStorage.setItem(pinStorageKey, JSON.stringify(next));
        } catch (err) {
          console.error('Failed to save pinned conversations:', err);
        }
      }
      return next;
    });
  }, [pinStorageKey]);

  const toggleMasking = () => setMaskingEnabled(prev => !prev);

  // Initialize user from Supabase Auth + Public Users Table
  useEffect(() => {
    async function boot() {
      try {
        console.log('🔄 Booting App Context...');

        // 0. Check if this is a password recovery / invite link OR an auth error (e.g. otp_expired)
        const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '');
        const searchParams = new URLSearchParams(window.location.search);
        const authType = hashParams.get('type') || searchParams.get('type');
        const hasAuthError = hashParams.get('error') || hashParams.get('error_code') || searchParams.get('error') || searchParams.get('error_code');
        const isRecoveryOrInvite = authType === 'recovery' || authType === 'invite' || !!hasAuthError;

        if (isRecoveryOrInvite && window.location.pathname !== '/set-password') {
          console.log('🔑 Recovery/Invite/Auth Error detected in URL. Redirecting to /set-password...');
          window.location.href = `/set-password${window.location.hash || window.location.search}`;
          return;
        }

        // 1. Check Supabase Session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          console.log('🔐 Supabase Session Found:', session.user.email);
          const { user: authUser } = session;

          // If session was established from recovery and user is not on /set-password, redirect
          if (isRecoveryOrInvite && window.location.pathname !== '/set-password') {
            window.location.href = `/set-password${window.location.hash || window.location.search}`;
            return;
          }

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

          if (!businessUser) {
            console.log('🛠️ Attempting server-side business user ensure...');
            businessUser = await AuthService.ensureBusinessUser();
          }

          if (businessUser) {
            if (businessUser.profileId && !businessUser.profileName) {
              try {
                const { data: profData } = await supabase
                  .from('profiles')
                  .select('name')
                  .eq('id', businessUser.profileId)
                  .maybeSingle();
                if (profData?.name) {
                  businessUser.profileName = profData.name;
                }
              } catch (profErr) {
                console.warn('⚠️ Could not load profile name:', profErr);
              }
            }

            console.log('👤 Business Profile Loaded:', businessUser);
            setCurrentUser({ ...businessUser });

            // 4. Permission Logic
            try {
              const persistedPermissions = businessUser.profileId
                ? await api.getProfilePermissions(businessUser.profileId)
                : [];
              setUserPermissions(
                persistedPermissions.length > 0
                  ? persistedPermissions
                  : getDefaultPermissionsForRole(businessUser.role)
              );
            } catch (permissionError) {
              console.error('⚠️ Failed to load profile permissions, using role fallback:', permissionError);
              setUserPermissions(getDefaultPermissionsForRole(businessUser.role));
            }

            // 5. Tenant Logic
            const savedTenantId = localStorage.getItem('davos_active_tenant_id');
            // For non-super_admin users (operators, etc.), their assigned tenantId ALWAYS takes precedence
            // to avoid loading an inaccessible tenant from stale localStorage
            const tenantIdToLoad = businessUser.role === 'super_admin'
              ? (savedTenantId || null)
              : (businessUser.tenantId || savedTenantId);

            if (tenantIdToLoad) {
              const tenant = await api.getTenant(tenantIdToLoad);
              if (tenant) {
                setCurrentTenant(tenant);
                localStorage.setItem('davos_active_tenant_id', tenant.id);
                console.log('🏢 Tenant loaded:', tenant.name);
              } else {
                console.warn('⚠️ Tenant fetch failed via getTenant. Attempting fallback via getCompanies...');
                const availableCompanies = await api.getCompanies();
                const fallbackTenant = availableCompanies.find((company) => company.id === tenantIdToLoad)
                  || (businessUser.tenantId ? availableCompanies.find((company) => company.id === businessUser.tenantId) : null)
                  || (availableCompanies.length === 1 ? availableCompanies[0] : null);

                if (fallbackTenant) {
                  setCurrentTenant(fallbackTenant);
                  localStorage.setItem('davos_active_tenant_id', fallbackTenant.id);
                  console.log('🏢 Tenant loaded via fallback:', fallbackTenant.name);
                } else {
                  console.warn('⚠️ No tenant could be loaded for business user.');
                }
              }
            } else if (businessUser.role !== 'super_admin') {
              const availableCompanies = await api.getCompanies();
              const autoTenant = (businessUser.tenantId ? availableCompanies.find((company) => company.id === businessUser.tenantId) : null)
                || (availableCompanies.length === 1 ? availableCompanies[0] : null);
              if (autoTenant) {
                setCurrentTenant(autoTenant);
                localStorage.setItem('davos_active_tenant_id', autoTenant.id);
                console.log('🏢 Tenant auto-selected:', autoTenant.name);
              }
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
      if (event === 'PASSWORD_RECOVERY') {
        console.log('🔑 PASSWORD_RECOVERY event received! Navigating to /set-password...');
        if (window.location.pathname !== '/set-password') {
          window.location.href = `/set-password${window.location.hash || window.location.search}`;
        }
        return;
      }
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

  // --- REFACTOR [FASE 1]: Realtime Over Polling ---
  const selectedConvIdRef = useRef<string | null>(null);
  
  // Keep stable refs so Realtime closures never go stale and don't trigger re-subscriptions
  const fetchMessagesRef = useRef<(convIdOverride?: string, force?: boolean) => Promise<void>>(async () => {});
  const loadConversationsListRef = useRef<() => Promise<void>>(async () => {});
  const isFetchingMessagesRef = useRef(false);
  const lastFetchTrackerRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const fetchMessages = useCallback(async (convIdOverride?: string, force = false) => {
    const activeId = convIdOverride || selectedConvIdRef.current;
    if (!activeId) return;

    // Evita rajadas simultâneas de requests para a mesma conversa (a menos que seja forçado)
    const now = Date.now();
    if (!force && lastFetchTrackerRef.current.id === activeId && (now - lastFetchTrackerRef.current.time < 1200)) {
      return;
    }
    if (isFetchingMessagesRef.current && !force) return;
    isFetchingMessagesRef.current = true;
    lastFetchTrackerRef.current = { id: activeId, time: now };
    
    try {
      const messages = await api.getConversationMessages(activeId);

      // Detecta nova mensagem do lead recebida via polling/refresh para tocar som se a conversa for do operador ou pinada
      const cachedConv = conversationsRef.current.find(c => c.id === activeId);
      const prevMsgs = cachedConv?.messages || [];
      if (prevMsgs.length > 0 && messages.length > prevMsgs.length) {
        const prevIds = new Set(prevMsgs.map(m => m.id));
        const newlyArrivedUserMsgs = messages.filter(m => !prevIds.has(m.id) && m.sender === 'user');
        if (newlyArrivedUserMsgs.length > 0) {
          const user = currentUserRef.current;
          const isMyAssigned = Boolean(
            user && cachedConv && (
              (cachedConv.assigned_operator_id && cachedConv.assigned_operator_id === user.id) ||
              (!cachedConv.assigned_operator_id && cachedConv.assignedOperator && user.name && cachedConv.assignedOperator.toLowerCase().includes(user.name.toLowerCase()))
            )
          );
          const isPinned = pinnedIdsRef.current.includes(activeId);
          if (isMyAssigned || isPinned) {
            playNotificationSound(newlyArrivedUserMsgs[newlyArrivedUserMsgs.length - 1].id);
          }
        }
      }
      
      setSelectedConversation(prev => {
        if (convIdOverride || (prev?.id === activeId)) {
          return { ...(prev || { id: activeId } as any), messages };
        }
        return prev;
      });
      
      setConversations(prev => {
        const exists = prev.some(c => c.id === activeId);
        if (exists) {
          const lastMsg = messages[messages.length - 1];
          return prev.map(c => c.id === activeId ? {
            ...c,
            messages,
            ...(lastMsg ? { lastMessage: lastMsg.content, lastMessageTime: lastMsg.timestamp, isAwaitingReply: lastMsg.sender === 'user' } : {})
          } : c);
        }
        return prev;
      });
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    } finally {
      isFetchingMessagesRef.current = false;
    }
  }, []); // stable — reads from ref, not from state

  // Keep ref in sync
  useEffect(() => { fetchMessagesRef.current = fetchMessages; }, [fetchMessages]);

  const loadConversationsList = useCallback(async () => {
    if (!currentTenant) return;
    try {
      const [tenantConversations, rpcCount] = await Promise.all([
        api.getConversationsOverview(currentTenant.id),
        api.getAwaitingReplyCount(currentTenant.id).catch(() => null)
      ]);

      const calculatedAwaitingCount = typeof rpcCount === 'number' && rpcCount >= 0
        ? rpcCount
        : tenantConversations.filter(c => c.isAwaitingReply).length;

      setAwaitingReplyCount(calculatedAwaitingCount);

      setConversations(prev => {
        const hasChanges = tenantConversations.length !== prev.length ||
          tenantConversations.some(c => {
            const p = prev.find(old => old.id === c.id);
            return !p ||
              p.lastMessageTime?.getTime?.() !== c.lastMessageTime?.getTime?.() ||
              p.status !== c.status ||
              p.userName !== c.userName ||
              p.userId !== c.userId ||
              p.userStatus !== c.userStatus ||
              p.agentName !== c.agentName ||
              p.channel !== c.channel ||
              p.messageCount !== c.messageCount ||
              p.isAwaitingReply !== c.isAwaitingReply ||
              p.establishmentName !== c.establishmentName;
          });

        if (!hasChanges) return prev;

        return tenantConversations.map(newConv => {
          const existing = prev.find(p => p.id === newConv.id);
          return {
            ...newConv,
            messages: existing ? existing.messages : []
          };
        });
      });

      // 🔧 Fix bolinha cinza: sync selectedConversation metadata (status, etc.) when list refreshes
      setSelectedConversation(prev => {
        if (!prev) return prev;
        const fresh = tenantConversations.find(c => c.id === prev.id);
        if (!fresh) return prev;
        // Only update if something changed (avoid unnecessary renders)
        if (fresh.status === prev.status && fresh.lastMessageTime?.getTime() === prev.lastMessageTime?.getTime() && fresh.isAwaitingReply === prev.isAwaitingReply) return prev;
        return { ...fresh, messages: prev.messages };
      });
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }, [currentTenant?.id]); // ← use only the primitive ID, not the full object

  const refreshAwaitingReplyCount = useCallback(async () => {
    if (!currentTenant?.id) return;
    try {
      const count = await api.getAwaitingReplyCount(currentTenant.id);
      setAwaitingReplyCount(count);
    } catch (e) {
      console.warn("Failed to refresh awaiting reply count:", e);
    }
  }, [currentTenant?.id]);

  const refreshSalesCockpitAwaitingCount = useCallback(async () => {
    const tenantId = currentTenant?.id || currentUser?.tenantId;
    if (!tenantId || !currentUser) {
      setSalesCockpitAwaitingCount(0);
      return;
    }
    try {
      const count = await salesCockpitService.getSalesCockpitAwaitingReplyCount(
        tenantId,
        currentUser.id,
        currentUser.name,
        currentUser.role
      );
      setSalesCockpitAwaitingCount(count);
    } catch (e) {
      console.warn("Failed to refresh sales cockpit awaiting reply count:", e);
    }
  }, [currentTenant?.id, currentUser?.tenantId, currentUser?.id, currentUser?.name, currentUser?.role]);

  // Monitoramento global leve (5s) para conversas assumidas pelo atendente ou fixadas com Pin:
  // garante som e atualização instantânea mesmo com outra conversa aberta ou navegador em segundo plano
  const myConvsLastMsgMsRef = useRef<Map<string, number>>(new Map());
  const myConvsMonitorInitRef = useRef<string | null>(null);

  useEffect(() => {
    const tenantId = currentTenant?.id;
    const userId = currentUser?.id;
    if (!tenantId || !userId) return;

    const scopeKey = `${tenantId}:${userId}`;
    if (myConvsMonitorInitRef.current !== scopeKey) {
      myConvsLastMsgMsRef.current = new Map();
      myConvsMonitorInitRef.current = null;
    }

    const pollMyConversations = async () => {
      try {
        const pinned = pinnedIdsRef.current;
        const orFilter = pinned.length > 0
          ? `assigned_operator_id.eq.${userId},id.in.(${pinned.join(',')})`
          : `assigned_operator_id.eq.${userId}`;

        const { data: rows, error } = await supabase
          .from('conversations')
          .select('id, last_message_at, status, assigned_operator_id')
          .eq('tenant_id', tenantId)
          .or(orFilter)
          .limit(100);

        if (error || !rows) return;

        const isFirstRun = myConvsMonitorInitRef.current !== scopeKey;
        if (isFirstRun) {
          for (const r of rows) {
            const ms = r.last_message_at ? new Date(r.last_message_at).getTime() : 0;
            myConvsLastMsgMsRef.current.set(r.id, ms);
          }
          myConvsMonitorInitRef.current = scopeKey;
          return;
        }

        const changedConvIds: string[] = [];
        for (const r of rows) {
          const newMs = r.last_message_at ? new Date(r.last_message_at).getTime() : 0;
          const prevMs = myConvsLastMsgMsRef.current.get(r.id);
          if (prevMs === undefined) {
            myConvsLastMsgMsRef.current.set(r.id, newMs);
            if (newMs > 0) changedConvIds.push(r.id);
          } else if (newMs > prevMs) {
            myConvsLastMsgMsRef.current.set(r.id, newMs);
            changedConvIds.push(r.id);
          }
        }

        if (changedConvIds.length === 0) return;

        for (const convId of changedConvIds) {
          const msgs = await api.getConversationMessages(convId).catch(() => null);
          if (!msgs || msgs.length === 0) continue;

          // Conta todas as novas mensagens do lead que chegaram desde o último timestamp conhecido
          const prevCached = conversationsRef.current.find(c => c.id === convId);
          const prevIds = new Set((prevCached?.messages || []).map(m => m.id));
          const newUserMsgs = prevIds.size > 0
            ? msgs.filter(m => !prevIds.has(m.id) && m.sender === 'user')
            : [msgs[msgs.length - 1]].filter(m => m.sender === 'user');

          if (newUserMsgs.length > 0) {
            recordUnreadMessages(convId, newUserMsgs.map(m => m.id));
            playNotificationSound(newUserMsgs[newUserMsgs.length - 1].id);
          } else {
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg.sender === 'user') {
              playNotificationSound(lastMsg.id);
            }
          }

          const lastMsg = msgs[msgs.length - 1];

          setSelectedConversation(prev => (prev?.id === convId ? { ...prev, messages: msgs } : prev));
          setConversations(prev => {
            const exists = prev.some(c => c.id === convId);
            if (!exists) return prev;
            return prev.map(c => c.id === convId ? {
              ...c,
              messages: msgs,
              lastMessage: lastMsg.content,
              lastMessageTime: lastMsg.timestamp,
              isAwaitingReply: lastMsg.sender === 'user'
            } : c);
          });
        }

        refreshSalesCockpitAwaitingCount();
      } catch {
        // Silencioso em falhas transitórias de rede
      }
    };

    pollMyConversations();
    const interval = setInterval(pollMyConversations, 5000);
    return () => clearInterval(interval);
  }, [currentTenant?.id, currentUser?.id, refreshSalesCockpitAwaitingCount]);

  // Carrega e atualiza periodicamente o contador do Cockpit de Vendas (deferido para não competir com o carregamento inicial)
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      refreshSalesCockpitAwaitingCount();
    }, 3000);
    const interval = setInterval(refreshSalesCockpitAwaitingCount, 60000); // a cada 60s
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [refreshSalesCockpitAwaitingCount]);

  // Keep ref in sync
  useEffect(() => { loadConversationsListRef.current = loadConversationsList; }, [loadConversationsList]);

  // Keep ref updated for Realtime handlers to avoid stale closures
  const conversationsRef = useRef<Conversation[]>([]);
  const currentUserRef = useRef<User | null>(null);
  const pinnedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    selectedConvIdRef.current = selectedConversation?.id || null;
  }, [selectedConversation?.id]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  useEffect(() => {
    pinnedIdsRef.current = pinnedConversationIds;
  }, [pinnedConversationIds]);
  useEffect(() => {
    return initNotificationAudioUnlock();
  }, []);
  useEffect(() => {
    const onFocusOrVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden && selectedConvIdRef.current) {
        markConversationAsRead(selectedConvIdRef.current);
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [markConversationAsRead]);

  // Stable callback for loading handoff requests
  const loadHandoffs = useCallback(async () => {
    const tenantId = currentTenant?.id || currentUser?.tenantId;
    if (!tenantId) {
      console.warn('⚠️ [Handoff] Tentativa de carga sem Tenant ID');
      return;
    }
    
    console.log('🔍 [Handoff] Buscando pedidos (Fila + Hoje) para:', tenantId);
    const { data, error } = await supabase
      .from('handoff_requests')
      .select('*, conversations(id, user_name, user_identifier, agent_id, agents:agents!conversations_agent_id_fkey(id, name)), agent_leads(id, identifier, name, whatsapp, metadata)')
      .eq('tenant_id', tenantId)
      .neq('status', 'ignored')
      .order('requested_at', { ascending: false })
      .limit(2000);
      
    if (error) {
      console.error('❌ [Handoff] Erro na consulta:', error);
    } else {
      console.log('✅ [Handoff] Pedidos encontrados:', data?.length || 0);
      if (data) setHandoffRequests(data);
    }
  }, [currentTenant?.id, currentUser?.tenantId]);

  // Combined Realtime Subscription Effect
  useEffect(() => {
    if (!currentTenant?.id) return;

    console.log("🔥 [Phase 2] Subscribing to REALTIME changes for tenant:", currentTenant.id);

    loadHandoffs();
    loadConversationsListRef.current();

    // Strategy: Throttle list updates to avoid thrashing during rapid messages
    let refreshTimeout: any;
    const debouncedRefresh = () => {
       // Se já tem um refresh agendado, não faz nada (evita starvation contínuo)
       if (refreshTimeout) return;
       
       refreshTimeout = setTimeout(() => {
          refreshTimeout = null;
          loadConversationsListRef.current();
          refreshSalesCockpitAwaitingCount();
       }, 2500); // 2500ms throttle para manter resposta rápida sem sobrecarregar o banco
    };

    // 1. Subscribe to Conversations (Update list automatically)
    const convChannel = supabase
      .channel(`tenant-convs-${currentTenant.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*', // Listen to All: insert, update, delete
          schema: 'public',
          table: 'conversations',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        async (payload: any) => {
          console.log(`📡 Realtime Conversation Change [${payload.eventType}]`);
          debouncedRefresh(); 
        }
      )
      .subscribe();

    // 2. Subscribe to Messages (Update current chat instantly)
    // Strategy: Since Supabase payloads might arrive partial (metadata-only) due to RLS,
    // we use the 'Signal' of an INSERT to trigger a full refetch of the logic.
    const msgChannel = supabase
      .channel(`tenant-msgs-${currentTenant.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*', // INSERT + UPDATE + DELETE — captura status de entrega e edições
          schema: 'public',
          table: 'messages',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        async (payload: any) => {
           console.log('💬 Signal: New Message detected via Realtime.', payload.eventType);
           
           // Apenas atualiza a conversa ABERTA se a mensagem for dela (com force=true para resposta instantânea)
           const newMsgConvId = payload.new?.conversation_id;
           if (selectedConvIdRef.current && newMsgConvId === selectedConvIdRef.current) {
              (fetchMessagesRef.current as any)(selectedConvIdRef.current, true);
           }
           
           // 🔥 OTIMIZAÇÃO CRÍTICA: Se a mensagem for nossa (ex: disparo em massa da campanha),
           // NÃO recarregamos a lista de conversas. Só recarregamos quando o LEAD responde!
           // Isso impede que campanhas causem DDOS no Supabase e gerem Timeout (57014).
           if (payload.new && (payload.new.from_me === true || payload.new.fromMe === true)) {
               return; 
           }

           // 🔔 Som de notificação EXCLUSIVO para conversas que o atendente logado assumiu para ele
           const isInboundLeadMsg = payload.eventType === 'INSERT' && (
             payload.new?.direction === 'inbound' ||
             payload.new?.sender_type === 'user'
           );
           if (isInboundLeadMsg && newMsgConvId) {
             const user = currentUserRef.current;
             const conv = conversationsRef.current.find(c => c.id === newMsgConvId);
             const isMyAssigned = Boolean(
               user && conv && (
                 (conv.assigned_operator_id && conv.assigned_operator_id === user.id) ||
                 (!conv.assigned_operator_id && conv.assignedOperator && user.name && conv.assignedOperator.toLowerCase().includes(user.name.toLowerCase()))
               )
             );

             const isPinned = pinnedIdsRef.current.includes(newMsgConvId);
             if (isMyAssigned || isPinned) {
               playNotificationSound(payload.new?.id);
               refreshSalesCockpitAwaitingCount();
               // Atualiza prévia na lista de conversas imediatamente
               setConversations(prev => prev.map(c => c.id === newMsgConvId ? {
                 ...c,
                 lastMessage: payload.new?.content ?? c.lastMessage,
                 lastMessageTime: payload.new?.created_at ? new Date(payload.new.created_at) : new Date(),
                 isAwaitingReply: true
               } : c));
             } else if (!conv && user) {
               // Caso a conversa ainda não esteja no cache local (ex: Cockpit de Vendas),
               // verifica no banco se está atribuída exclusivamente ao operador logado
               supabase
                 .from('conversations')
                 .select('assigned_operator_id, metadata')
                 .eq('id', newMsgConvId)
                 .single()
                 .then(({ data: cData }) => {
                   if (!cData) return;
                   const opName = String(cData.metadata?.operator_name || '').toLowerCase();
                   const isMineInDb = Boolean(
                     (cData.assigned_operator_id && cData.assigned_operator_id === user.id) ||
                     (!cData.assigned_operator_id && user.name && opName.includes(user.name.toLowerCase()))
                   );
                   if (isMineInDb) {
                     playNotificationSound(payload.new?.id);
                     refreshSalesCockpitAwaitingCount();
                   }
                 })
                 .catch(() => {});
             }
           }
           
           debouncedRefresh();
        }
      )
      .subscribe();

    const leadsChannel = supabase
      .channel(`tenant-leads-${currentTenant.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'agent_leads',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        async (payload: any) => {
          console.log(`🏪 Realtime Lead Change [${payload.eventType}]`);
          debouncedRefresh();
        }
      )
      .subscribe();

    // 4. Real-time Handoff Requests Subscription
    const handoffChannel = supabase
      .channel('handoff-hub')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'handoff_requests',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        async (payload: any) => {
          console.log('🔔 Handoff Signal:', payload.eventType);
          if (payload.eventType === 'INSERT') {
            // Fetch conversation and lead details
            const { data: conv } = await supabase
              .from('conversations')
              .select('id, user_name, user_identifier, agent_id, agents:agents!conversations_agent_id_fkey(id, name)')
              .eq('id', payload.new.conversation_id)
              .single();
            
            let lead = null;
            if (payload.new.lead_id) {
              const { data: leadData } = await supabase
                .from('agent_leads')
                .select('id, identifier, name, whatsapp, metadata')
                .eq('id', payload.new.lead_id)
                .single();
              lead = leadData;
            }

            const enrichedNew = {
              ...payload.new,
              conversations: conv || null,
              agent_leads: lead || null
            };
            
            setHandoffRequests(prev => [enrichedNew, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setHandoffRequests(prev => prev.map(h => {
              if (h.id === payload.new.id) {
                return { ...payload.new, conversations: h.conversations, agent_leads: h.agent_leads };
              }
              return h;
            }));
          } else if (payload.eventType === 'DELETE') {
            setHandoffRequests(prev => prev.filter(h => h.id === payload.old.id));
          }
        }
      )
      .subscribe();

    // Health-check Polling (Extreme safety: 10 minutes)
    const intervalId = setInterval(() => loadConversationsListRef.current(), 600000);

    return () => {
      console.log("📴 Unsubscribing from Realtime...");
      supabase.removeChannel(convChannel);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(handoffChannel);
      clearInterval(intervalId);
      if (refreshTimeout) clearTimeout(refreshTimeout);
    };
  }, [currentTenant?.id]); // ← only re-subscribe when tenant actually changes

  useEffect(() => {
    fetchMessages();
  }, [selectedConversation?.id, fetchMessages]);

  // Sincroniza a conversa selecionada sempre que a lista de conversas for atualizada (Realtime, etc.)
  const lastSyncedConvRef = useRef<{ id: string; status: string; userStatus?: string } | null>(null);

  useEffect(() => {
    if (selectedConversation) {
      const current = conversations.find(c => c.id === selectedConversation.id);
      if (current) {
        const hasMetadataChanged =
          current.status !== selectedConversation.status ||
          current.assignedOperator !== selectedConversation.assignedOperator ||
          current.sentiment !== selectedConversation.sentiment ||
          current.complianceScore !== selectedConversation.complianceScore ||
          current.userStatus !== selectedConversation.userStatus;

        const isAlreadySynced = 
          lastSyncedConvRef.current?.id === current.id && 
          lastSyncedConvRef.current?.status === current.status &&
          lastSyncedConvRef.current?.userStatus === current.userStatus;

        if (hasMetadataChanged && !isAlreadySynced) {
          lastSyncedConvRef.current = { id: current.id, status: current.status, userStatus: current.userStatus };
          console.log(`🔄 Syncing selectedConversation metadata: ${selectedConversation.id} -> ${current.status}`);
          setSelectedConversation(prev => prev && prev.id === current.id ? {
            ...prev,
            status: current.status,
            assignedOperator: current.assignedOperator,
            sentiment: current.sentiment,
            complianceScore: current.complianceScore,
            userStatus: current.userStatus
          } : prev);
        }
      }
    }
  }, [conversations, selectedConversation?.id]);


  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Handle Global Branding
  useEffect(() => {
    if (currentTenant?.brand_color) {
      try {
        const hslString = hexToHslTuple(currentTenant.brand_color);
        document.documentElement.style.setProperty('--primary', hslString);
        document.documentElement.style.setProperty('--sidebar-background', hslString);
        document.documentElement.style.setProperty('--sidebar-primary', hslString);
        // Ensure accent elements also pick up the brand if needed
        document.documentElement.style.setProperty('--accent', hslString);
      } catch(e) {
        console.error("Failed to apply brand color", e);
      }
    } else {
      // Revert to CSS defaults
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--sidebar-background');
      document.documentElement.style.removeProperty('--sidebar-primary');
      document.documentElement.style.removeProperty('--accent');
    }
  }, [currentTenant?.brand_color]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const hasPermission = (permission: string): boolean => {
    // Super admin always has all permissions
    if (currentUser?.role === 'super_admin') return true;
    return userPermissions.includes('all') || userPermissions.includes(permission);
  };

  const refreshPermissions = async () => {
    if (!currentUser) return;
    try {
      const persistedPermissions = currentUser.profileId
        ? await api.getProfilePermissions(currentUser.profileId)
        : [];
      setUserPermissions(
        persistedPermissions.length > 0
          ? persistedPermissions
          : getDefaultPermissionsForRole(currentUser.role)
      );
    } catch (permissionError) {
      console.error('⚠️ Failed to refresh permissions:', permissionError);
    }
  };

  const switchTenant = async (tenantId: string) => {
    try {
      // In real app, we check if user has access to that tenant.
      const targetTenant = await api.getTenant(tenantId);
      if (!targetTenant) {
        throw new Error('Tenant not found or access denied');
      }

      setCurrentTenant(targetTenant);
      localStorage.setItem('davos_active_tenant_id', tenantId);
      console.log(`Switched to tenant: ${targetTenant.name}`);
    } catch (error) {
      console.error('Failed to switch tenant:', error);
      throw error; // Re-throw to be caught by the caller (e.g. SelectTenant)
    }
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

    // 1. Criar a mensagem de sistema localmente
    const systemMsg = {
      id: `${conversationId}-takeover-${Date.now()}`,
      conversationId,
      tenantId: currentTenant.id,
      tenantSlug: currentTenant.slug,
      content: `🔄 ${currentUser.name} assumiu a conversa`,
      type: 'text' as const,
      sender: 'ai' as const,
      timestamp: new Date(),
    };

    // 2. Atualização otimista funcional preservando o histórico existente
    setSelectedConversation(prev => {
      if (!prev || prev.id !== conversationId) return prev;
      return {
        ...prev,
        status: 'human_active',
        assignedOperator: currentUser.name,
        messages: [...(prev.messages || []), systemMsg]
      };
    });

    setConversations(prev => {
      const exists = prev.some(conv => conv.id === conversationId);
      if (exists) {
        return prev.map(conv => conv.id === conversationId ? {
          ...conv,
          status: 'human_active',
          assignedOperator: currentUser.name,
          messages: [...(conv.messages || []), systemMsg]
        } : conv);
      }
      return prev;
    });

    try {
      await api.assignConversation(conversationId, currentUser.id, currentUser.name);
      await api.sendMessage(conversationId, `🔄 ${currentUser.name} assumiu a conversa`, 'ai');
      // 3. Força a carga completa do histórico do banco de dados
      await fetchMessages(conversationId, true);
    } catch (error) {
      console.error('Error in takeOverConversation:', error);
    }
  };

  const returnToAI = async (conversationId: string) => {
    if (!currentTenant || !currentUser) return;

    const systemMsg = {
      id: `${conversationId}-return-${Date.now()}`,
      conversationId,
      tenantId: currentTenant.id,
      tenantSlug: currentTenant.slug,
      content: '🤖 IA retomou o atendimento',
      type: 'text' as const,
      sender: 'ai' as const,
      timestamp: new Date(),
    };

    setSelectedConversation(prev => {
      if (!prev || prev.id !== conversationId) return prev;
      return {
        ...prev,
        status: 'ai_active',
        assignedOperator: undefined,
        messages: [...(prev.messages || []), systemMsg]
      };
    });

    setConversations(prev => {
      return prev.map(conv => conv.id === conversationId ? {
        ...conv,
        status: 'ai_active',
        assignedOperator: undefined,
        messages: [...(conv.messages || []), systemMsg]
      } : conv);
    });

    try {
      await api.assignConversation(conversationId, null, currentUser.name);
      await api.sendMessage(conversationId, '🤖 IA retomou o atendimento', 'ai');
      // 3. Força a carga completa do histórico do banco de dados
      await fetchMessages(conversationId, true);
    } catch (error) {
      console.error('Error in returnToAI:', error);
    }
  };

  const transferConversation = async (conversationId: string, operatorName: string) => {
    if (!currentTenant) return;
    const currentConv = conversations.find(c => c.id === conversationId) || 
      (selectedConversation?.id === conversationId ? selectedConversation : null);
    const previousOperator = currentConv?.assignedOperator || 'IA';

    const systemMsg = {
      id: `${conversationId}-transfer-${Date.now()}`,
      conversationId,
      tenantId: currentTenant.id,
      tenantSlug: currentTenant.slug,
      content: `🔀 Conversa transferida de ${previousOperator} para ${operatorName}`,
      type: 'text' as const,
      sender: 'ai' as const,
      timestamp: new Date(),
    };

    const updatedConv = currentConv ? {
      ...currentConv,
      assignedOperator: operatorName,
      messages: [...(currentConv.messages || []), systemMsg]
    } : null;

    setConversations(prev => {
      const exists = prev.some(conv => conv.id === conversationId);
      if (exists) {
        return prev.map(conv => conv.id === conversationId && updatedConv ? updatedConv : conv);
      }
      if (updatedConv) return [updatedConv, ...prev];
      return prev;
    });

    if (selectedConversation?.id === conversationId && updatedConv) {
      setSelectedConversation(updatedConv);
    }

    try {
      await api.sendMessage(conversationId, `🔀 Conversa transferida de ${previousOperator} para ${operatorName}`, 'ai');
    } catch (error) {
      console.error(error);
    }
  };

  const closeConversation = async (conversationId: string) => {
    if (!currentTenant) return;
    const currentConv = conversations.find(c => c.id === conversationId) || 
      (selectedConversation?.id === conversationId ? selectedConversation : null);

    const updatedConv = currentConv ? { ...currentConv, status: 'closed' as const } : null;

    // Optimistic UI Update
    setConversations(prev => {
      const exists = prev.some(conv => conv.id === conversationId);
      if (exists) {
        return prev.map(conv => conv.id === conversationId && updatedConv ? updatedConv : conv);
      }
      if (updatedConv) return [updatedConv, ...prev];
      return prev;
    });

    if (selectedConversation?.id === conversationId && updatedConv) {
      setSelectedConversation(updatedConv);
    }

    try {
      await api.closeConversation(conversationId);
      // 🔥 Automate Quality Audit Trigger
      await api.triggerAudit(conversationId, {
        tenantId: currentConv?.tenantId || currentTenant.id,
        agentId: currentConv?.agentId
      });
    } catch (error) {
      console.error(error);
    }
  };

  const sendMessage = async (
    conversationId: string, 
    content: string, 
    type: 'text' | 'image' | 'audio' | 'document' = 'text',
    attachmentMeta?: { fileUrl?: string; fileName?: string; mimeType?: string }
  ) => {
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
      fileUrl: attachmentMeta?.fileUrl,
      fileName: attachmentMeta?.fileName,
      imageUrl: type === 'image' ? attachmentMeta?.fileUrl : undefined,
      sender: 'human' as const, // Always human when sending from UI
      senderName: currentUser.name,
      timestamp: new Date()
    };

    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? {
            ...conv,
            lastMessage: type === 'text' ? content : (attachmentMeta?.fileName ? `📎 ${attachmentMeta.fileName}` : 'Anexo enviado'),
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

    // Auto-takeover: se a conversa ainda não estiver com status 'human_active',
    // assume automaticamente o atendimento, pausa a Sofia (IA) e vincula o operador logado.
    const currentConv = conversations.find(c => c.id === conversationId) || (selectedConversation?.id === conversationId ? selectedConversation : null);
    const needsTakeover = currentConv && (currentConv.status !== 'human_active' || !currentConv.assignedOperator);

    if (needsTakeover) {
      setConversations(prev =>
        prev.map(c =>
          c.id === conversationId
            ? { ...c, status: 'human_active', assignedOperator: currentUser.name }
            : c
        )
      );
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? {
          ...prev,
          status: 'human_active',
          assignedOperator: currentUser.name
        } : null);
      }
      api.assignConversation(conversationId, currentUser.id, currentUser.name).catch(e => {
        console.warn('Erro ao atualizar atribuição de operador ao enviar mensagem:', e);
      });
    }

    // 2. API Call
    try {
      await api.sendMessage(conversationId, content, 'human', currentUser.name, type, attachmentMeta);
    } catch (error) {
      console.error("Message send failed:", error);
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
        refreshPermissions,
        conversations,
        setConversations,
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
        fetchMessages,
        handoffRequests,
        refreshHandoffs: loadHandoffs,
        awaitingReplyCount,
        refreshAwaitingReplyCount,
        salesCockpitAwaitingCount,
        refreshSalesCockpitAwaitingCount,
        pinnedConversationIds,
        togglePinConversation,
        unreadCounts,
        markConversationAsRead,
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
