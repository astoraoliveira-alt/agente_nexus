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
  Megaphone,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  ShieldCheck,
  Workflow,
  Brain,
  CreditCard,
  LayoutGrid,
  PieChart,
  Activity,
  Gauge,
  Zap
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { mockAlerts } from '@/lib/mock-data';

// Navigation items are now handled dynamically inside the component to support real-time badges

const adminNavItems = [
  { title: 'Status do Sistema', url: '/admin/status', icon: Activity },
  { title: 'Usuários', url: '/users', icon: Users },
  { title: 'Perfis', url: '/profiles', icon: Shield },

  { title: 'Configurações', url: '/settings', icon: Settings },
];

const governanceNavItems = [
  { title: 'CRM (Kanban)',        url: '/lead-crm',       icon: LayoutGrid },
  { title: 'Observatório',        url: '/observatory',    icon: Zap },
  { title: 'Qualidade',           url: '/quality',         icon: ShieldCheck },
  { title: 'Governança IA',       url: '/governance',      icon: ShieldCheck },
  { title: 'Performance & IA',    url: '/ai-performance',  icon: Gauge },
  // { title: 'Logs de Decisão', url: '/decision-logs', icon: Brain },
  // { title: 'Fluxos', url: '/flows', icon: Workflow },
];

const platformNavItems = [
  { title: 'Empresas', url: '/companies', icon: Building2 },
  { title: 'Planos de Serviço', url: '/plans', icon: CreditCard },
  { title: 'Resumo Financeiro', url: '/financials', icon: PieChart },
];

export function AppSidebar() {
  const { isDarkMode, toggleDarkMode, currentUser, currentTenant, openSlideOver, hasPermission, conversations } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const unreadAlerts = mockAlerts.filter(a => !a.read).length;

  const activeConversationsCount = conversations.filter(c => c.status !== 'closed').length;

  const dynamicMainNavItems = [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard },
    { title: 'Consumo', url: '/consumption', icon: BarChart3 },
    { title: 'Conversas', url: '/conversations', icon: MessageSquare, badge: activeConversationsCount > 0 ? activeConversationsCount : undefined },
    { title: 'Contatos', url: '/contacts', icon: Users },
    { title: 'Agentes', url: '/agents', icon: Bot },
    { title: 'Campanhas', url: '/campaigns', icon: Megaphone },
  ];

  const handleLogout = () => {
    localStorage.removeItem('davos_session');
    localStorage.removeItem('davos_active_tenant_id');
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

      {/* Tenant Info & Compliance Score */}
      {!collapsed && currentTenant && (
        <div className="px-4 py-4 mx-2 mt-2 space-y-3">
          <div className={cn(
            "p-3 rounded-md border transition-all duration-200",
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
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="px-3 mb-2">
          {!collapsed && (
            <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wider px-3 mb-2">Principal</p>
          )}
          <ul className="space-y-1">
            {dynamicMainNavItems.map((item) => (
              <li key={item.url}>
                <NavLink
                  to={item.url}
                  end={item.url === '/'}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
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
                      'flex items-center gap-3 px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
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
                      'flex items-center gap-3 px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
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
          <div className={cn(
            "mt-4 pt-4 border-t border-sidebar-border/60 bg-blue-500/5 pb-2 mx-2 rounded-xl transition-all duration-300",
            collapsed ? "px-1" : "px-1"
          )}>
            {!collapsed && (
              <p className="text-[10px] text-blue-500/80 font-black uppercase tracking-[0.2em] px-3 mb-2">Admin Davos</p>
            )}
            <ul className="space-y-1">
              {platformNavItems.map((item) => (
                <li key={item.url}>
                  <NavLink
                    to={item.url}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-xs font-semibold text-sidebar-foreground/70 hover:bg-blue-500/10 hover:text-blue-600 transition-all rounded-lg',
                      collapsed && 'justify-center px-0'
                    )}
                    activeClassName="bg-blue-500/10 text-blue-600 border-l-2 border-blue-500"
                  >
                    <item.icon className={cn(
                      "h-5 w-5 flex-shrink-0 transition-colors",
                      "group-hover:text-blue-500"
                    )} />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Footer Actions - Compact Horizontal Layout  */}
      <div className={cn(
        "p-2 border-t border-sidebar-border flex items-center gap-1",
        collapsed ? "flex-col" : "justify-between"
      )}>
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDarkMode}
          title={isDarkMode ? 'Modo Claro' : 'Modo Escuro'}
          className="h-9 w-9 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground shrink-0"
        >
          {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* User Info / Profile - Expanded with Name */}
        <Button
          variant="ghost"
          onClick={() => openSlideOver('user-profile')}
          title={`Perfil: ${currentUser?.name}`}
          className={cn(
            "h-10 p-1 hover:bg-sidebar-accent transition-all duration-200 overflow-hidden",
            collapsed ? "w-10 justify-center" : "flex-1 justify-start gap-2 px-2"
          )}
        >
          <div className="h-8 w-8 rounded-sm bg-accent flex items-center justify-center text-accent-foreground text-xs font-black shrink-0 shadow-sm">
            {currentUser?.avatar || (currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U')}
          </div>
          {!collapsed && (
            <div className="flex flex-col items-start min-w-0">
              <span className="text-xs font-bold text-sidebar-foreground truncate w-full">
                {currentUser?.name?.split(' ')[0]}
              </span>
              <span className="text-[9px] text-sidebar-foreground/50 truncate w-full lowercase">
                {currentUser?.email}
              </span>
            </div>
          )}
        </Button>

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Sair do Sistema"
          className="h-9 w-9 text-sidebar-foreground/80 hover:bg-destructive hover:text-destructive-foreground shrink-0"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
