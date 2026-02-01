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
  LogOut
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

export function AppSidebar() {
  const { isDarkMode, toggleDarkMode, currentUser, currentTenant } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const unreadAlerts = mockAlerts.filter(a => !a.read).length;

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
        <div className="px-4 py-3 border-b border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wider">Tenant</p>
          <p className="text-sm font-medium text-sidebar-foreground truncate">{currentTenant.name}</p>
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

        {/* Admin Section */}
        {(currentUser?.role === 'super_admin' || currentUser?.role === 'tenant_admin') && (
          <div className="px-3 mt-6">
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
        <div className={cn(
          'flex items-center gap-3 px-3 py-2',
          collapsed && 'justify-center'
        )}>
          <div className="w-8 h-8 bg-sidebar-accent flex items-center justify-center text-sidebar-foreground text-sm font-medium">
            {currentUser?.avatar || 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{currentUser?.role?.replace('_', ' ')}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
