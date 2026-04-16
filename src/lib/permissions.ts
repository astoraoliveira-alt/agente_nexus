import { Permission } from '@/lib/types';

export type PermissionSection = 'principal' | 'governanca' | 'admin' | 'admin_davos';

export interface PermissionDefinition extends Permission {
  moduleId: string;
  action: string;
  section: PermissionSection;
  internalOnly?: boolean;
}

export interface PermissionModule {
  id: string;
  title: string;
  description: string;
  section: PermissionSection;
  internalOnly?: boolean;
  permissions: PermissionDefinition[];
}

const defineModule = (
  id: string,
  title: string,
  description: string,
  section: PermissionSection,
  permissions: Array<{
    action: string;
    name: string;
    description: string;
    internalOnly?: boolean;
  }>,
  internalOnly = false
): PermissionModule => ({
  id,
  title,
  description,
  section,
  internalOnly,
  permissions: permissions.map((permission) => ({
    id: `${id}.${permission.action}`,
    moduleId: id,
    action: permission.action,
    name: permission.name,
    description: permission.description,
    category: title,
    section,
    internalOnly: internalOnly || permission.internalOnly,
  })),
});

export const PERMISSION_MODULES: PermissionModule[] = [
  defineModule('dashboard', 'Dashboard', 'Visibilidade do painel principal e KPIs executivos.', 'principal', [
    { action: 'view', name: 'Acessar Dashboard', description: 'Visualizar o dashboard principal.' },
  ]),
  defineModule('consumption', 'Consumo', 'Métricas e relatórios de uso da plataforma.', 'principal', [
    { action: 'view', name: 'Acessar Consumo', description: 'Visualizar relatórios de consumo.' },
    { action: 'export', name: 'Exportar Consumo', description: 'Exportar relatórios e dados de consumo.' },
  ]),
  defineModule('conversations', 'Conversas', 'Operação da inbox e atendimento das conversas.', 'principal', [
    { action: 'view', name: 'Acessar Conversas', description: 'Visualizar lista e histórico de conversas.' },
    { action: 'takeover', name: 'Assumir Conversas', description: 'Assumir atendimento manualmente.' },
    { action: 'transfer', name: 'Transferir Conversas', description: 'Transferir conversas entre operadores.' },
    { action: 'reply', name: 'Responder Conversas', description: 'Enviar mensagens manualmente.' },
    { action: 'details', name: 'Ver Detalhes', description: 'Abrir detalhes analíticos da conversa.' },
  ]),
  defineModule('contacts', 'Contatos', 'Base de contatos e dados operacionais do CRM.', 'principal', [
    { action: 'view', name: 'Acessar Contatos', description: 'Visualizar lista de contatos.' },
    { action: 'create', name: 'Criar Contatos', description: 'Cadastrar novos contatos.' },
    { action: 'edit', name: 'Editar Contatos', description: 'Editar dados de contatos existentes.' },
    { action: 'delete', name: 'Excluir Contatos', description: 'Remover contatos da base.' },
    { action: 'export', name: 'Exportar Contatos', description: 'Exportar listas e relatórios de contatos.' },
  ]),
  defineModule('agents', 'Agentes', 'Configuração e governança dos agentes de IA.', 'principal', [
    { action: 'view', name: 'Acessar Agentes', description: 'Visualizar a listagem de agentes.' },
    { action: 'create', name: 'Criar Agentes', description: 'Cadastrar novos agentes.' },
    { action: 'edit', name: 'Editar Agentes', description: 'Editar configurações dos agentes.' },
    { action: 'delete', name: 'Excluir Agentes', description: 'Remover agentes existentes.' },
    { action: 'history', name: 'Ver Histórico', description: 'Visualizar histórico e auditoria do agente.' },
    { action: 'duplicate', name: 'Duplicar Agentes', description: 'Clonar agentes existentes.' },
  ]),
  defineModule('campaigns', 'Campanhas', 'Gestão de campanhas outbound e cargas de leads.', 'principal', [
    { action: 'view', name: 'Acessar Campanhas', description: 'Visualizar campanhas e indicadores.' },
    { action: 'create', name: 'Criar Campanhas', description: 'Cadastrar novas campanhas.' },
    { action: 'edit', name: 'Editar Campanhas', description: 'Editar campanhas existentes.' },
    { action: 'delete', name: 'Excluir Campanhas', description: 'Excluir campanhas.' },
    { action: 'import', name: 'Importar Leads', description: 'Importar listas de leads para campanhas.' },
    { action: 'view_contacts', name: 'Ver Leads da Campanha', description: 'Abrir a listagem de contatos carregados.' },
    { action: 'pause', name: 'Pausar ou Retomar', description: 'Pausar ou reativar campanhas.' },
  ]),
  defineModule('crm', 'CRM (Kanban)', 'Gestão de pipeline comercial e movimentação de cards.', 'governanca', [
    { action: 'view', name: 'Acessar CRM', description: 'Visualizar o quadro Kanban.' },
    { action: 'manage_cards', name: 'Gerenciar Cards', description: 'Mover e atualizar cards do CRM.' },
    { action: 'edit_stage', name: 'Editar Etapas', description: 'Editar etapas e estrutura do funil.' },
  ]),
  defineModule('observatory', 'Observatório', 'Visão analítica e observabilidade operacional.', 'governanca', [
    { action: 'view', name: 'Acessar Observatório', description: 'Visualizar métricas e painéis do observatório.' },
    { action: 'export', name: 'Exportar Observatório', description: 'Exportar relatórios analíticos.' },
  ]),
  defineModule('quality', 'Qualidade', 'Análises, auditorias e indicadores de qualidade.', 'governanca', [
    { action: 'view', name: 'Acessar Qualidade', description: 'Visualizar auditorias e indicadores.' },
    { action: 'export', name: 'Exportar Qualidade', description: 'Exportar relatórios de qualidade.' },
  ]),
  defineModule('governance', 'Governança IA', 'Políticas, riscos e governança de IA.', 'governanca', [
    { action: 'view', name: 'Acessar Governança IA', description: 'Visualizar políticas e informações de governança.' },
    { action: 'manage', name: 'Gerenciar Governança IA', description: 'Editar políticas, riscos e configurações.' },
  ]),
  defineModule('ai_performance', 'Performance & IA', 'Centro de performance e análises de IA.', 'governanca', [
    { action: 'view', name: 'Acessar Performance & IA', description: 'Visualizar indicadores de performance.' },
    { action: 'export', name: 'Exportar Performance & IA', description: 'Exportar relatórios de performance.' },
  ]),
  defineModule('system_status', 'Status do Sistema', 'Monitoramento operacional e saúde da plataforma.', 'admin', [
    { action: 'view', name: 'Acessar Status do Sistema', description: 'Visualizar o painel de status operacional.' },
  ]),
  defineModule('users', 'Usuários', 'Gestão de usuários da empresa.', 'admin', [
    { action: 'view', name: 'Acessar Usuários', description: 'Visualizar listagem de usuários.' },
    { action: 'create', name: 'Criar Usuários', description: 'Cadastrar novos usuários.' },
    { action: 'edit', name: 'Editar Usuários', description: 'Editar usuários existentes.' },
    { action: 'delete', name: 'Excluir Usuários', description: 'Remover usuários do sistema.' },
  ]),
  defineModule('profiles', 'Perfis', 'Configuração de perfis e matriz de permissões.', 'admin', [
    { action: 'view', name: 'Acessar Perfis', description: 'Visualizar perfis de acesso.' },
    { action: 'create', name: 'Criar Perfis', description: 'Cadastrar novos perfis.' },
    { action: 'edit', name: 'Editar Perfis', description: 'Editar perfis existentes.' },
    { action: 'delete', name: 'Excluir Perfis', description: 'Excluir perfis customizados.' },
  ]),
  defineModule('settings', 'Configurações', 'Parâmetros gerais da plataforma e da operação.', 'admin', [
    { action: 'view', name: 'Acessar Configurações', description: 'Visualizar a tela de configurações.' },
    { action: 'edit', name: 'Editar Configurações', description: 'Salvar alterações nas configurações.' },
  ]),
  defineModule('companies', 'Empresas', 'Administração interna de tenants e empresas.', 'admin_davos', [
    { action: 'view', name: 'Acessar Empresas', description: 'Visualizar empresas/tenants.', internalOnly: true },
    { action: 'create', name: 'Criar Empresas', description: 'Cadastrar novas empresas.', internalOnly: true },
    { action: 'edit', name: 'Editar Empresas', description: 'Editar empresas existentes.', internalOnly: true },
    { action: 'delete', name: 'Excluir Empresas', description: 'Excluir empresas.', internalOnly: true },
  ], true),
  defineModule('plans', 'Planos de Serviço', 'Administração interna de planos e contratos.', 'admin_davos', [
    { action: 'view', name: 'Acessar Planos', description: 'Visualizar planos de serviço.', internalOnly: true },
    { action: 'create', name: 'Criar Planos', description: 'Cadastrar novos planos.', internalOnly: true },
    { action: 'edit', name: 'Editar Planos', description: 'Editar planos existentes.', internalOnly: true },
    { action: 'delete', name: 'Excluir Planos', description: 'Excluir planos.', internalOnly: true },
  ], true),
  defineModule('financials', 'Resumo Financeiro', 'Painéis financeiros internos da plataforma.', 'admin_davos', [
    { action: 'view', name: 'Acessar Resumo Financeiro', description: 'Visualizar o resumo financeiro.', internalOnly: true },
    { action: 'export', name: 'Exportar Financeiro', description: 'Exportar relatórios financeiros.', internalOnly: true },
  ], true),
];

export const PERMISSIONS_CATALOG: PermissionDefinition[] = PERMISSION_MODULES.flatMap((module) => module.permissions);

export const getAssignablePermissionModules = (includeInternal = false) =>
  PERMISSION_MODULES.filter((module) => includeInternal || !module.internalOnly)
    .map((module) => ({
      ...module,
      permissions: module.permissions.filter((permission) => includeInternal || !permission.internalOnly),
    }))
    .filter((module) => module.permissions.length > 0);

const publicPermissionIds = PERMISSIONS_CATALOG.filter((permission) => !permission.internalOnly).map((permission) => permission.id);
const allPermissionIds = PERMISSIONS_CATALOG.map((permission) => permission.id);

const viewerPermissions = [
  'dashboard.view',
  'consumption.view',
  'conversations.view',
  'conversations.details',
  'contacts.view',
  'agents.view',
  'campaigns.view',
  'campaigns.view_contacts',
  'crm.view',
  'observatory.view',
  'quality.view',
  'governance.view',
  'ai_performance.view',
  'system_status.view',
  'users.view',
  'profiles.view',
  'settings.view',
];

const operatorPermissions = [
  ...viewerPermissions,
  'conversations.takeover',
  'conversations.transfer',
  'conversations.reply',
  'contacts.create',
  'contacts.edit',
  'campaigns.import',
];

export const getDefaultPermissionsForRole = (role?: string | null): string[] => {
  if (role === 'super_admin') return ['all', ...allPermissionIds];
  if (role === 'tenant_admin') return publicPermissionIds;
  if (role === 'operator') return operatorPermissions;
  return viewerPermissions;
};

export const getPermissionModule = (permissionId: string) =>
  PERMISSIONS_CATALOG.find((permission) => permission.id === permissionId);
