// Davos Nexus - Core Types & Interfaces

// ============ RBAC Types ============
export interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  tenantId: string | null; // null = platform-wide role
}

export interface UserRole {
  userId: string;
  roleId: string;
}

// ============ Tenant/Company Types ============
export interface Company {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  createdAt: Date;
  limits: {
    llmTokens: number;
    messages: number;
    sttMinutes: number;
    ttsMinutes: number;
    agents: number;
    users: number;
  };
  settings: {
    aiNoticeMessage: string;
    retentionDays: number;
    anonymizationEnabled: boolean;
  };
}

// ============ AI Governance Types ============
export interface AgentGovernance {
  agentId: string;
  riskLevel: 'low' | 'medium' | 'high';
  usageType: 'informational' | 'operational' | 'sensitive';
  autonomyLevel: number; // 1-5
  policies: string[];
}

export interface AIPolicy {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  createdAt: Date;
  rules: {
    canDo: string[];
    cannotDo: string[];
    transferConditions: string[];
  };
  isActive: boolean;
}

export interface AIDecisionLog {
  id: string;
  conversationId: string;
  messageId: string;
  agentId: string;
  flowId?: string;
  timestamp: Date;
  decision: string;
  autonomyUsed: number;
  humanOverride: boolean;
  overrideBy?: string;
  reasoning: string;
}

export interface AIIncident {
  id: string;
  tenantId: string;
  conversationId?: string;
  agentId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  createdAt: Date;
  resolvedAt?: Date;
  status: 'open' | 'investigating' | 'resolved';
  actionTaken?: string;
  reportedBy: string;
}

// ============ Conversational Flow Types ============
export interface ConversationalFlow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  objective: string;
  type: 'inbound' | 'outbound';
  agentIds: string[];
  steps: FlowStep[];
  successCriteria: string;
  isActive: boolean;
  createdAt: Date;
}

export interface FlowStep {
  id: string;
  name: string;
  order: number;
  type: 'greeting' | 'qualification' | 'resolution' | 'handoff' | 'closing';
  description: string;
}

// ============ Metrics Types ============
export interface FlowMetrics {
  flowId: string;
  flowName: string;
  totalConversations: number;
  successfulConversations: number;
  successRate: number;
  avgCompletionTime: number; // in seconds
  humanInterventions: number;
  humanInterventionRate: number;
}

export interface SuccessMetrics {
  tenantId: string;
  period: string;
  totalConversations: number;
  successfulConversations: number;
  overallSuccessRate: number;
  avgTimeToResolution: number;
  humanInterventions: number;
  byFlow: FlowMetrics[];
}

// ============ Extended Conversation Types ============
export interface ExtendedConversation {
  origin: 'inbound' | 'outbound';
  flowId?: string;
  decisionLogs: AIDecisionLog[];
}

// ============ All Permissions ============
export const ALL_PERMISSIONS: Permission[] = [
  // Conversations
  { id: 'conversations.view', name: 'Visualizar Conversas', description: 'Ver lista e histórico de conversas', category: 'Conversas' },
  { id: 'conversations.operate', name: 'Operar Conversas', description: 'Responder e interagir com conversas', category: 'Conversas' },
  { id: 'conversations.takeover', name: 'Assumir Conversas', description: 'Assumir atendimento de conversas da IA', category: 'Conversas' },
  { id: 'conversations.transfer', name: 'Transferir Conversas', description: 'Transferir conversas entre operadores', category: 'Conversas' },
  { id: 'conversations.ai_toggle', name: 'Alternar IA', description: 'Ativar ou desativar IA em conversas', category: 'Conversas' },
  
  // Agents
  { id: 'agents.view', name: 'Visualizar Agentes', description: 'Ver configurações dos agentes', category: 'Agentes' },
  { id: 'agents.edit', name: 'Editar Agentes', description: 'Modificar configurações dos agentes', category: 'Agentes' },
  { id: 'agents.create', name: 'Criar Agentes', description: 'Criar novos agentes', category: 'Agentes' },
  
  // Flows
  { id: 'flows.view', name: 'Visualizar Fluxos', description: 'Ver fluxos conversacionais', category: 'Fluxos' },
  { id: 'flows.manage', name: 'Gerenciar Fluxos', description: 'Criar e editar fluxos', category: 'Fluxos' },
  
  // Consumption
  { id: 'consumption.view', name: 'Visualizar Consumo', description: 'Ver relatórios de consumo', category: 'Consumo' },
  { id: 'consumption.financial', name: 'Dados Financeiros', description: 'Ver custos e dados financeiros', category: 'Consumo' },
  { id: 'consumption.export', name: 'Exportar Relatórios', description: 'Exportar dados de consumo', category: 'Consumo' },
  
  // Users
  { id: 'users.view', name: 'Visualizar Usuários', description: 'Ver lista de usuários', category: 'Usuários' },
  { id: 'users.manage', name: 'Gerenciar Usuários', description: 'Criar, editar e desativar usuários', category: 'Usuários' },
  
  // Governance
  { id: 'governance.view', name: 'Visualizar Governança', description: 'Ver políticas e logs de IA', category: 'Governança' },
  { id: 'governance.manage', name: 'Gerenciar Governança', description: 'Editar políticas de IA', category: 'Governança' },
  { id: 'governance.incidents', name: 'Gerenciar Incidentes', description: 'Registrar e resolver incidentes', category: 'Governança' },
  
  // Administration
  { id: 'profiles.manage', name: 'Gerenciar Perfis', description: 'Criar e editar perfis de acesso', category: 'Administração' },
  { id: 'settings.manage', name: 'Configurações', description: 'Gerenciar configurações da plataforma', category: 'Administração' },
  
  // Platform (Super Admin only)
  { id: 'platform.companies', name: 'Gerenciar Empresas', description: 'Criar e gerenciar empresas/tenants', category: 'Plataforma' },
  { id: 'platform.global_settings', name: 'Config. Globais', description: 'Configurações globais da plataforma', category: 'Plataforma' },
];

// ============ Default Roles ============
export const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-super-admin',
    name: 'Super Admin Davos',
    description: 'Acesso total à plataforma e todas as empresas',
    permissions: ALL_PERMISSIONS.map(p => p.id),
    isSystem: true,
    tenantId: null,
  },
  {
    id: 'role-tenant-admin',
    name: 'Admin da Empresa',
    description: 'Acesso total à empresa do usuário',
    permissions: ALL_PERMISSIONS.filter(p => !p.category.includes('Plataforma')).map(p => p.id),
    isSystem: true,
    tenantId: null,
  },
  {
    id: 'role-operator',
    name: 'Operador',
    description: 'Atendimento e visualização de conversas',
    permissions: [
      'conversations.view', 'conversations.operate', 'conversations.takeover', 
      'conversations.transfer', 'conversations.ai_toggle', 'agents.view', 'flows.view'
    ],
    isSystem: true,
    tenantId: null,
  },
  {
    id: 'role-viewer',
    name: 'Visualização',
    description: 'Somente leitura',
    permissions: ['conversations.view', 'agents.view', 'consumption.view', 'flows.view'],
    isSystem: true,
    tenantId: null,
  },
];
