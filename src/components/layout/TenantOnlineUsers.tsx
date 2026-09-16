import React from 'react';
import { PresenceUser } from '@/hooks/useTenantPresence';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface TenantOnlineUsersProps {
  users: PresenceUser[];
  currentUserId?: string;
  collapsed?: boolean;
}

export function TenantOnlineUsers({ users, currentUserId, collapsed }: TenantOnlineUsersProps) {
  if (!users || users.length === 0) return null;

  const maxVisible = collapsed ? 3 : 5;
  const visibleUsers = users.slice(0, maxVisible);
  const remainingUsers = users.slice(maxVisible);
  const remainingCount = remainingUsers.length;

  const getInitials = (name: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'tenant_admin':
        return 'Admin';
      case 'operator':
        return 'Operador';
      case 'viewer':
        return 'Visualizador';
      default:
        return role;
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn(
        "transition-all duration-200",
        collapsed ? "px-2 py-2 flex flex-col items-center gap-1.5" : "px-4 py-2"
      )}>
        {/* Header line for expanded mode */}
        {!collapsed && (
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                Online agora
              </span>
            </div>
            <span className="text-[10px] font-bold text-sidebar-foreground/70 bg-black/20 px-1.5 py-0.2 rounded">
              {users.length}
            </span>
          </div>
        )}

        {/* Avatars Stack */}
        <div className={cn(
          "flex items-center",
          collapsed ? "flex-col -space-y-1.5" : "-space-x-1.5"
        )}>
          {visibleUsers.map((user) => {
            const isSelf = user.id === currentUserId;
            const initials = getInitials(user.name, user.email);

            return (
              <Tooltip key={user.id}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "relative flex items-center justify-center rounded-full text-[10px] font-bold select-none cursor-pointer transition-transform hover:scale-110 hover:z-20 border-2 border-sidebar-background shadow-sm",
                      collapsed ? "w-7 h-7" : "w-6 h-6",
                      isSelf
                        ? "bg-amber-500 text-black font-extrabold"
                        : "bg-white/20 text-sidebar-foreground hover:bg-white/30 backdrop-blur-xs"
                    )}
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <span>{initials}</span>
                    )}

                    {/* Green online badge dot */}
                    <span className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-sidebar-background" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side={collapsed ? "right" : "bottom"} className="flex flex-col gap-0.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>{user.name}</span>
                    {isSelf && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-normal">
                        Você
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{user.email}</span>
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground/80 mt-0.5 pt-0.5 border-t border-border/40">
                    <span>{getRoleLabel(user.role)}</span>
                    <span className="text-emerald-500 font-semibold">Ativo agora</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Overflow count circle */}
          {remainingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "relative flex items-center justify-center rounded-full text-[9px] font-bold select-none cursor-pointer transition-transform hover:scale-110 hover:z-20 border-2 border-sidebar-background bg-black/40 text-sidebar-foreground/90 shadow-sm",
                    collapsed ? "w-7 h-7" : "w-6 h-6"
                  )}
                >
                  +{remainingCount}
                </div>
              </TooltipTrigger>
              <TooltipContent side={collapsed ? "right" : "bottom"} className="text-xs">
                <p className="font-semibold mb-1">Outros usuários conectados:</p>
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {remainingUsers.map((u) => (
                    <li key={u.id} className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      <span>{u.name || u.email}</span>
                    </li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
