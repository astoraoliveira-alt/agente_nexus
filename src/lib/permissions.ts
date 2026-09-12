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
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'export', name: 'Exportar Dashboard', description: 'Exportar relatórios e métricas do painel executivo.' },
  ]),
  defineModule('sales_cockpit', 'Cockpit de Vendas', 'Fila de fechamento e formalização bancária Fiserv.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'takeover', name: 'Assumir Atendimento (HITL)', description: 'Permite ao operador assumir o atendimento de leads na fila de vendas.' },
    { action: 'change_stage', name: 'Alterar Etapa do Funil', description: 'Permite avançar ou alterar o status da pipeline (Pendente, Em Contato, Contrato Enviado, Assinado).' },
    { action: 'send_message', name: 'Enviar Mensagens no Chat', description: 'Permite enviar mensagens manuais pelo WhatsApp para o lead.' },
    { action: 'export', name: 'Exportar Fila de Vendas', description: 'Exportar dados analíticos e contratos da fila.' },
  ]),
  defineModule('consumption', 'Consumo', 'Métricas e relatórios de uso da plataforma.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'export', name: 'Exportar Consumo', description: 'Exportar relatórios e dados de consumo.' },
  ]),
  defineModule('conversations', 'Conversas', 'Operação da inbox e atendimento das conversas.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'takeover', name: 'Assumir Conversas', description: 'Assumir atendimento manualmente.' },
    { action: 'transfer', name: 'Transferir Conversas', description: 'Transferir conversas entre operadores.' },
    { action: 'reply', name: 'Responder Conversas', description: 'Enviar mensagens manualmente.' },
    { action: 'details', name: 'Ver Detalhes', description: 'Abrir detalhes analíticos da conversa.' },
    { action: 'close', name: 'Encerrar / Devolver IA', description: 'Encerrar conversa ou devolver atendimento para a IA.' },
    { action: 'export', name: 'Exportar Histórico', description: 'Baixar transcrição completa das mensagens.' },
  ]),
  defineModule('contacts', 'Contatos', 'Base de contatos e dados operacionais do CRM.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'create', name: 'Criar Contatos', description: 'Cadastrar novos contatos.' },
    { action: 'edit', name: 'Editar Contatos', description: 'Editar dados de contatos existentes.' },
    { action: 'delete', name: 'Excluir Contatos', description: 'Remover contatos da base.' },
    { action: 'export', name: 'Exportar Contatos', description: 'Exportar listas e relatórios de contatos.' },
  ]),
  defineModule('agents', 'Agentes', 'Configuração e governança dos agentes de IA.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'create', name: 'Criar Agentes', description: 'Cadastrar novos agentes.' },
    { action: 'edit', name: 'Editar Agentes', description: 'Editar configurações dos agentes.' },
    { action: 'delete', name: 'Excluir Agentes', description: 'Remover agentes existentes.' },
    { action: 'history', name: 'Ver Histórico', description: 'Visualizar histórico e auditoria do agente.' },
    { action: 'duplicate', name: 'Duplicar Agentes', description: 'Clonar agentes existentes.' },
  ]),
  defineModule('campaigns', 'Campanhas', 'Gestão de campanhas outbound e cargas de leads.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'create', name: 'Criar Campanhas', description: 'Cadastrar novas campanhas.' },
    { action: 'edit', name: 'Editar Campanhas', description: 'Editar campanhas existentes.' },
    { action: 'delete', name: 'Excluir Campanhas', description: 'Excluir campanhas.' },
    { action: 'import', name: 'Importar Leads', description: 'Importar listas de leads para campanhas.' },
    { action: 'view_contacts', name: 'Ver Leads da Campanha', description: 'Abrir a listagem de contatos carregados.' },
    { action: 'pause', name: 'Pausar ou Retomar', description: 'Pausar ou reativar campanhas.' },
  ]),
  defineModule('campaign_recovery', 'Central de Reengajamento', 'Recuperação proativa de leads e campanhas pausadas.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'trigger', name: 'Disparar Recuperação', description: 'Permite disparar novas ondas de mensagens para leads da recuperação.' },
  ]),
  defineModule('incidents', 'Comunicados', 'Gestão de comunicados operacionais e incidentes de clientes.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'create', name: 'Criar Comunicados', description: 'Cadastrar novos comunicados ou registrar incidentes.' },
    { action: 'manage', name: 'Gerenciar Comunicados', description: 'Editar, pausar, arquivar ou finalizar comunicados.' },
  ]),
  defineModule('handoff', 'Fila de Atendimento', 'Gestão de transição de IA para atendimento humano.', 'principal', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'manage', name: 'Gerenciar Fila', description: 'Atender solicitações e gerenciar o status da fila.' },
    { action: 'transfer', name: 'Transferir Solicitações', description: 'Transferir chamados da fila para outros operadores.' },
  ]),
  defineModule('crm', 'CRM (Kanban)', 'Gestão de pipeline comercial e movimentação de cards.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'manage_cards', name: 'Gerenciar Cards', description: 'Mover e atualizar cards do CRM.' },
    { action: 'edit_stage', name: 'Editar Etapas', description: 'Editar etapas e estrutura do funil.' },
    { action: 'create_lead', name: 'Cadastrar Lead no Funil', description: 'Adicionar manualmente novos cards de oportunidade.' },
    { action: 'export', name: 'Exportar Funil', description: 'Exportar dados dos leads e movimentações.' },
  ]),
  defineModule('observatory', 'Observatório', 'Visão analítica e observabilidade operacional.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'export', name: 'Exportar Observatório', description: 'Exportar relatórios analíticos.' },
  ]),
  defineModule('quality', 'Qualidade', 'Análises, auditorias e indicadores de qualidade.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'export', name: 'Exportar Qualidade', description: 'Exportar relatórios de qualidade.' },
    { action: 'audit', name: 'Executar Auditoria', description: 'Disparar auditorias manuais de compliance e alucinação.' },
  ]),
  defineModule('governance', 'Governança IA', 'Políticas, riscos e governança de IA.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'manage', name: 'Gerenciar Governança IA', description: 'Editar políticas, riscos e configurações.' },
  ]),
  defineModule('ai_performance', 'Performance & IA', 'Centro de performance e análises de IA.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'export', name: 'Exportar Performance & IA', description: 'Exportar relatórios de performance.' },
  ]),
  defineModule('schema_explorer', 'Schema Explorer', 'Acesso ao Schema Explorer e construtor de consultas.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
  ]),
  defineModule('flows', 'Fluxos Conversacionais', 'Editor visual de fluxos conversacionais e blueprints de IA.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'edit', name: 'Editar Fluxos', description: 'Criar e editar nós, gatilhos e instruções dos fluxos.' },
  ]),
  defineModule('decision_logs', 'Logs de Decisão', 'Histórico detalhado das decisões e raciocínio dos agentes.', 'governanca', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
  ]),
  defineModule('system_status', 'Status do Sistema', 'Monitoramento operacional e saúde da plataforma.', 'admin', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
  ]),
  defineModule('users', 'Usuários', 'Gestão de usuários da empresa.', 'admin', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'create', name: 'Criar Usuários', description: 'Cadastrar novos usuários.' },
    { action: 'edit', name: 'Editar Usuários', description: 'Editar usuários existentes.' },
    { action: 'delete', name: 'Excluir Usuários', description: 'Remover usuários do sistema.' },
    { action: 'assign_profile', name: 'Atribuir Perfis', description: 'Definir e alterar perfil de acesso dos colaboradores.' },
  ]),
  defineModule('profiles', 'Perfis', 'Configuração de perfis e matriz de permissões.', 'admin', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'create', name: 'Criar Perfis', description: 'Cadastrar novos perfis.' },
    { action: 'edit', name: 'Editar Perfis', description: 'Editar perfis existentes.' },
    { action: 'delete', name: 'Excluir Perfis', description: 'Excluir perfis customizados.' },
  ]),
  defineModule('settings', 'Configurações', 'Parâmetros gerais da plataforma e da operação.', 'admin', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'edit', name: 'Editar Configurações', description: 'Salvar alterações nas configurações operacionais.' },
    { action: 'integrations', name: 'Gerenciar Integrações', description: 'Configurar canais WhatsApp, webhooks e provedores.' },
  ]),
  defineModule('alerts', 'Alertas do Sistema', 'Notificações e avisos críticos em tempo real.', 'admin', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.' },
    { action: 'manage', name: 'Gerenciar Alertas', description: 'Marcar alertas como lidos, arquivar e configurar notificações.' },
  ]),
  defineModule('companies', 'Empresas', 'Administração interna de tenants e empresas.', 'admin_davos', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.', internalOnly: true },
    { action: 'create', name: 'Criar Empresas', description: 'Cadastrar novas empresas.', internalOnly: true },
    { action: 'edit', name: 'Editar Empresas', description: 'Editar empresas existentes.', internalOnly: true },
    { action: 'delete', name: 'Excluir Empresas', description: 'Excluir empresas.', internalOnly: true },
  ], true),
  defineModule('plans', 'Planos de Serviço', 'Administração interna de planos e contratos.', 'admin_davos', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.', internalOnly: true },
    { action: 'create', name: 'Criar Planos', description: 'Cadastrar novos planos.', internalOnly: true },
    { action: 'edit', name: 'Editar Planos', description: 'Editar planos existentes.', internalOnly: true },
    { action: 'delete', name: 'Excluir Planos', description: 'Excluir planos.', internalOnly: true },
  ], true),
  defineModule('financials', 'Resumo Financeiro', 'Painéis financeiros internos da plataforma.', 'admin_davos', [
    { action: 'view', name: 'Acesso à tela', description: 'Controla a exibição da tela no menu e a entrada no módulo.', internalOnly: true },
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
  'sales_cockpit.view',
  'consumption.view',
  'conversations.view',
  'conversations.details',
  'contacts.view',
  'agents.view',
  'campaigns.view',
  'campaigns.view_contacts',
  'campaign_recovery.view',
  'incidents.view',
  'crm.view',
  'observatory.view',
  'quality.view',
  'governance.view',
  'ai_performance.view',
  'schema_explorer.view',
  'flows.view',
  'decision_logs.view',
  'system_status.view',
  'users.view',
  'profiles.view',
  'settings.view',
  'alerts.view',
  'handoff.view',
];

const operatorPermissions = [
  ...viewerPermissions,
  'sales_cockpit.takeover',
  'sales_cockpit.change_stage',
  'sales_cockpit.send_message',
  'conversations.takeover',
  'conversations.transfer',
  'conversations.reply',
  'conversations.close',
  'contacts.create',
  'contacts.edit',
  'campaigns.import',
  'campaign_recovery.trigger',
  'incidents.create',
  'handoff.manage',
  'handoff.transfer',
  'crm.manage_cards',
  'crm.create_lead',
  'alerts.manage',
];

export const getDefaultPermissionsForRole = (role?: string | null): string[] => {
  if (role === 'super_admin') return ['all', ...allPermissionIds];
  if (role === 'tenant_admin') return publicPermissionIds;
  if (role === 'operator') return operatorPermissions;
  return viewerPermissions;
};

export const getPermissionModule = (permissionId: string) =>
  PERMISSIONS_CATALOG.find((permission) => permission.id === permissionId);

