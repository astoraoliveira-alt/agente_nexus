import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Tenant } from '@/lib/types';

export interface PresenceUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  tenantId: string | null;
  onlineAt: string;
}

export function useTenantPresence(currentUser: User | null, currentTenant: Tenant | null) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!currentUser || !currentTenant?.id) {
      setOnlineUsers([]);
      return;
    }

    // Tenant scoped room so users from different tenants never see each other
    const roomName = `presence:tenant:${currentTenant.id}`;
    const channel = supabase.channel(roomName, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    const updatePresenceState = () => {
      const presenceState = channel.presenceState();
      const usersMap = new Map<string, PresenceUser>();

      Object.values(presenceState).forEach((presences: any) => {
        presences.forEach((presence: any) => {
          if (presence?.user && presence.user.tenantId === currentTenant.id) {
            usersMap.set(presence.user.id, presence.user);
          }
        });
      });

      // Always guarantee the current user appears in their own list even while syncing
      if (!usersMap.has(currentUser.id)) {
        usersMap.set(currentUser.id, {
          id: currentUser.id,
          name: currentUser.name || currentUser.email || 'Usuário',
          email: currentUser.email,
          role: currentUser.role,
          avatar: currentUser.avatar,
          tenantId: currentTenant.id,
          onlineAt: new Date().toISOString(),
        });
      }

      setOnlineUsers(Array.from(usersMap.values()));
    };

    channel
      .on('presence', { event: 'sync' }, updatePresenceState)
      .on('presence', { event: 'join' }, updatePresenceState)
      .on('presence', { event: 'leave' }, updatePresenceState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const userPayload: PresenceUser = {
            id: currentUser.id,
            name: currentUser.name || currentUser.email || 'Usuário',
            email: currentUser.email,
            role: currentUser.role,
            avatar: currentUser.avatar,
            tenantId: currentTenant.id,
            onlineAt: new Date().toISOString(),
          };

          await channel.track({
            user: userPayload,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.name, currentUser?.email, currentUser?.role, currentTenant?.id]);

  const sortedUsers = useMemo(() => {
    return [...onlineUsers].sort((a, b) => {
      if (a.id === currentUser?.id) return -1;
      if (b.id === currentUser?.id) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [onlineUsers, currentUser?.id]);

  return { onlineUsers: sortedUsers };
}
