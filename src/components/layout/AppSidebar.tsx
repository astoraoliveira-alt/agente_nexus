import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Bot,
  Settings,
  Bell,
  Users,
  Shield,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  ShieldCheck,
  Workflow,
  Brain,
  CreditCard
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { mockAlerts } from '@/lib/mock-data';

const mainNavItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Conversas', url: '/conversations', icon: MessageSquare, badge: 3 },
  { title: 'Consumo', url: '/consumption', icon: BarChart3 },
  { title: 'Agentes', url: '/agents', icon: Bot },
];

const adminNavItems = [
  { title: 'Usuários', url: '/users', icon: Users },
  { title: 'Perfis', url: '/profiles', icon: Shield },
  { title: 'Configurações', url: '/settings', icon: Settings },
];

const governanceNavItems = [
  { title: 'Governança IA', url: '/governance', icon: ShieldCheck },
  { title: 'Logs de Decisão', url: '/decision-logs', icon: Brain },
  { title: 'Fluxos', url: '/flows', icon: Workflow },
];

const platformNavItems = [
  { title: 'Empresas', url: '/companies', icon: Building2 },
  { title: 'Planos de Serviço', url: '/plans', icon: CreditCard },
];

export function AppSidebar() {
  const { isDarkMode, toggleDarkMode, currentUser, currentTenant, openSlideOver, hasPermission } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const unreadAlerts = mockAlerts.filter(a => !a.read).length;

  const handleLogout = () => {
    localStorage.removeItem('davos_session');
    window.location.href = '/login';
  };

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'tenant_admin';

  return (
    <aside
      className={cn(
        'h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent flex items-center justify-center">
              <span className="text-accent-foreground font-bold text-sm">DN</span>
            </div>
            <span className="font-semibold text-sidebar-foreground">Davos Nexus</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Tenant Info */}
      {!collapsed && currentTenant && (
        <div className={cn(
          "px-4 py-4 mx-2 mt-2 rounded-md border transition-all duration-200",
          (isSuperAdmin && currentUser?.tenantId !== currentTenant.id)
            ? "bg-amber-100/10 border-amber-500/30" // Impersonation Mode
            : "bg-sidebar-accent border-sidebar-border" // Normal Mode
        )}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className={cn(
                "text-[10px] uppercase tracking-wider mb-0.5",
                (isSuperAdmin && currentUser?.tenantId !== currentTenant.id)
                  ? "text-amber-500 font-bold"
                  : "text-sidebar-foreground/60 font-bold"
              )}>
                {(isSuperAdmin && currentUser?.tenantId !== currentTenant.id) ? "Operando como" : "Cliente Conectado"}
              </p>
              <p className={cn(
                "text-sm font-bold truncate",
                (isSuperAdmin && currentUser?.tenantId !== currentTenant.id)
                  ? "text-amber-400"
                  : "text-sidebar-foreground"
              )}>{currentTenant.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="px-3 mb-2">
          {!collapsed && (
            <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wider px-3 mb-2">Principal</p>
          )}
          <ul className="space-y-1">
            {mainNavItems.map((item) => (
              <li key={item.url}>
                <NavLink
                  to={item.url}
                  end={item.url === '/'}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                    collapsed && 'justify-center'
                  )}
                  activeClassName="bg-sidebar-accent text-sidebar-foreground border-l-2 border-accent"
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.title}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="bg-accent text-accent-foreground text-xs px-1.5 py-0.5">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Governance Section */}
        {hasPermission('governance.view') && (
          <div className="px-3 mt-4">
            {!collapsed && (
              <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wider px-3 mb-2">Governança</p>
            )}
            <ul className="space-y-1">
              {governanceNavItems.map((item) => (
                <li key={item.url}>
                  <NavLink
                    to={item.url}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                      collapsed && 'justify-center'
                    )}
                    activeClassName="bg-sidebar-accent text-sidebar-foreground border-l-2 border-accent"
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Admin Section */}
        {isAdmin && (
          <div className="px-3 mt-4">
            {!collapsed && (
              <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wider px-3 mb-2">Admin</p>
            )}
            <ul className="space-y-1">
              {adminNavItems.map((item) => (
                <li key={item.url}>
                  <NavLink
                    to={item.url}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                      collapsed && 'justify-center'
                    )}
                    activeClassName="bg-sidebar-accent text-sidebar-foreground border-l-2 border-accent"
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Platform Admin Section (Super Admin Only) */}
        {isSuperAdmin && (
          <div className="px-3 mt-4">
            {!collapsed && (
              <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wider px-3 mb-2">Admin Davos</p>
            )}
            <ul className="space-y-1">
              {platformNavItems.map((item) => (
                <li key={item.url}>
                  <NavLink
                    to={item.url}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                      collapsed && 'justify-center'
                    )}
                    activeClassName="bg-sidebar-accent text-sidebar-foreground border-l-2 border-accent"
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Footer Actions */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {/* Alerts */}
        <NavLink
          to="/alerts"
          className={cn(
            'flex items-center gap-3 px-3 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
            collapsed && 'justify-center'
          )}
          activeClassName="bg-sidebar-accent text-sidebar-foreground"
        >
          <div className="relative">
            <Bell className="h-5 w-5" />
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                {unreadAlerts}
              </span>
            )}
          </div>
          {!collapsed && <span>Alertas</span>}
        </NavLink>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          onClick={toggleDarkMode}
          className={cn(
            'w-full justify-start gap-3 px-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            collapsed && 'justify-center'
          )}
        >
          {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          {!collapsed && <span>{isDarkMode ? 'Modo Claro' : 'Modo Escuro'}</span>}
        </Button>

        {/* User Info */}
        <button
          onClick={() => openSlideOver('user-profile')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 hover:bg-sidebar-accent transition-colors',
            collapsed && 'justify-center'
          )}
        >
          <div className="w-8 h-8 bg-sidebar-accent flex items-center justify-center text-sidebar-foreground text-sm font-medium">
            {currentUser?.avatar || 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{currentUser?.role?.replace('_', ' ')}</p>
            </div>
          )}
        </button>

        {/* Logout Button */}
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            'w-full justify-start gap-3 px-3 text-sidebar-foreground/80 hover:bg-destructive hover:text-destructive-foreground',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </div>
    </aside>
  );
}
