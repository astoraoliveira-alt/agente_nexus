// Extended Mock Data for Davos Nexus Evolution
import {
  Company,
  AIPolicy,
  AIDecisionLog,
  AIIncident,
  ConversationalFlow,
  SuccessMetrics,
  AgentGovernance,
  Role,
  DEFAULT_ROLES,
  AuditLog,
  ChannelEvent,
  SLAConfiguration,
  DSARRequest,
  PlanCatalog,
  TenantPlan,
  TenantISOStatus,
  TenantPrivacySettings,
  UserRole
} from './types';

// ============ Mock Plan Catalog ============
export const mockPlanCatalog: PlanCatalog[] = [
  {
    id: 'plan-free',
    name: 'Plano Free',
    type: 'fixed',
    description: 'Ideal para testes e pequenas automações.',
    basePrice: 0,
    llmTokenPrice: 0.50,
    messagePrice: 0.05,
    sttMinutePrice: 0.10,
    ttsMinutePrice: 0.10,
    defaultLimits: {
      llmTokens: 100000,
      messages: 5000,
      sttMinutes: 100,
      ttsMinutes: 50,
      agents: 2,
      users: 5
    }
  },
  {
    id: 'plan-pro',
    name: 'Plano Pro Professional',
    type: 'fixed',
    description: 'Para empresas em crescimento com volume moderado.',
    basePrice: 499.00,
    llmTokenPrice: 0.15,
    messagePrice: 0.02,
    sttMinutePrice: 0.08,
    ttsMinutePrice: 0.08,
    defaultLimits: {
      llmTokens: 2000000,
      messages: 50000,
      sttMinutes: 1500,
      ttsMinutes: 1000,
      agents: 5,
      users: 20
    }
  },
  {
    id: 'plan-enterprise-flex',
    name: 'Enterprise Flex',
    type: 'flex',
    description: 'Escalabilidade total com faturamento baseado em uso (Pay-as-you-go).',
    basePrice: 2499.00,
    llmTokenPrice: 0.10,
    messagePrice: 0.01,
    sttMinutePrice: 0.05,
    ttsMinutePrice: 0.05,
    defaultLimits: {
      llmTokens: 10000000,
      messages: 500000,
      sttMinutes: 10000,
      ttsMinutes: 10000,
      agents: 100,
      users: 500
    }
  },
  {
    id: 'plan-unlimited',
    name: 'Global Unlimited',
    type: 'unlimited',
    description: 'Sem limites para operações globais críticas.',
    basePrice: 9999.00,
    llmTokenPrice: 0.08,
    messagePrice: 0.005,
    sttMinutePrice: 0.04,
    ttsMinutePrice: 0.04,
    defaultLimits: {
      llmTokens: 100000000,
      messages: 5000000,
      sttMinutes: 100000,
      ttsMinutes: 100000,
      agents: 1000,
      users: 5000
    }
  },
];

// ============ Mock Tenant Plans ============
export const mockTenantPlans: TenantPlan[] = [
  {
    tenantId: 'tenant-1',
    planId: 'plan-enterprise-flex',
    type: 'flex',
    softLimits: {
      monthlyBudget: 15000,
      alertThresholds: [50, 80, 95],
    },
    overagePolicy: 'allow_with_alert',
  },
  {
    tenantId: 'tenant-2',
    planId: 'plan-pro',
    type: 'fixed',
    hardLimits: {
      llmTokens: 2000000,
      messages: 50000,
      sttMinutes: 1500,
      ttsMinutes: 1000,
      agents: 5,
      users: 20,
    },
    overagePolicy: 'block',
  },
];

// ============ Mock Tenant ISO Status ============
export const mockTenantISOStatus: TenantISOStatus[] = [
  {
    tenantId: 'tenant-1',
    aiSystemOwnerId: 'user-1',
    riskOwnerId: 'user-2',
    complianceResponsibleId: 'user-2',
    lifecyclePolicyDefined: true,
    riskMethodologyDefined: true,
    lastAuditAt: new Date('2024-12-10'),
  },
  {
    tenantId: 'tenant-2',
    lifecyclePolicyDefined: true,
    riskMethodologyDefined: false,
  }
];

// ============ Mock Companies (Updated) ============
export const mockCompanies: Company[] = [
  {
    id: 'tenant-1',
    name: 'Banco Digital Alpha',
    slug: 'banco-alpha',
    planId: 'plan-enterprise-flex',
    status: 'active',
    createdAt: new Date('2024-01-15'),
    plan: 'enterprise',
    limits: {
      llmTokens: 5000000,
      messages: 100000,
      sttMinutes: 3000,
      ttsMinutes: 2000,
      agents: 10,
      users: 50,
    },
    privacySettings: {
      tenantId: 'tenant-1',
      aiDisclosureMessage: 'Esta conversa pode ser assistida por inteligência artificial. Seus dados são tratados conforme nossa política de privacidade (ISO 42001).',
      anonymizationEnabled: true,
      retentionDays: 365,
    },
    settings: {
      aiNoticeMessage: 'Esta conversa pode ser assistida por inteligência artificial. Seus dados são tratados conforme nossa política de privacidade.', // legacy
      retentionDays: 365,
      anonymizationEnabled: true,
    },
    isoStatus: mockTenantISOStatus[0],
    planDetails: mockTenantPlans[0],
    aiResponsibles: {
      systemOwnerId: 'user-1',
      riskOwnerId: 'user-2',
      complianceOfficerId: 'user-2',
    }
  },
  {
    id: 'tenant-2',
    name: 'Seguradora Beta',
    slug: 'seguradora-beta',
    planId: 'plan-pro',
    status: 'active',
    createdAt: new Date('2024-03-22'),
    plan: 'pro',
    limits: {
      llmTokens: 2000000,
      messages: 50000,
      sttMinutes: 1500,
      ttsMinutes: 1000,
      agents: 5,
      users: 20,
    },
    privacySettings: {
      tenantId: 'tenant-2',
      aiDisclosureMessage: 'Você está conversando com um assistente virtual da Beta Seguros.',
      anonymizationEnabled: false,
      retentionDays: 180,
    },
    settings: {
      aiNoticeMessage: 'Você está conversando com um assistente virtual.', // legacy
      retentionDays: 180,
      anonymizationEnabled: false,
    },
    isoStatus: mockTenantISOStatus[1],
    planDetails: mockTenantPlans[1],
  },
  {
    id: 'tenant-3',
    name: 'Fintech Gamma',
    slug: 'fintech-gamma',
    planId: 'plan-free',
    status: 'trial',
    createdAt: new Date('2025-01-10'),
    plan: 'free',
    limits: {
      llmTokens: 100000,
      messages: 5000,
      sttMinutes: 100,
      ttsMinutes: 50,
      agents: 2,
      users: 5,
    },
    privacySettings: {
      tenantId: 'tenant-3',
      aiDisclosureMessage: 'Este chat usa IA para auxiliar no atendimento.',
      anonymizationEnabled: false,
      retentionDays: 30,
    },
    settings: {
      aiNoticeMessage: 'Este chat usa IA para auxiliar no atendimento.', // legacy
      retentionDays: 30,
      anonymizationEnabled: false,
    },
  },
];

// ============ Mock Roles per Tenant ============
export const mockRoles: Role[] = [
  ...DEFAULT_ROLES,
  {
    id: 'role-supervisor-t1',
    name: 'Supervisor',
    description: 'Monitoramento e relatórios da equipe',
    permissions: [
      'conversations.view', 'agents.view', 'consumption.view',
      'consumption.financial', 'users.view', 'flows.view', 'governance.view'
    ],
    isSystem: false,
    tenantId: 'tenant-1',
  },
  {
    id: 'role-analyst-t1',
    name: 'Analista',
    description: 'Acesso a relatórios e métricas',
    permissions: ['consumption.view', 'consumption.export', 'agents.view', 'flows.view'],
    isSystem: false,
    tenantId: 'tenant-1',
  },
];

// ============ Mock User Roles ============
export const mockUserRoles: UserRole[] = [
  { userId: 'user-1', roleId: 'role-super-admin' },
  { userId: 'user-2', roleId: 'role-tenant-admin' },
  { userId: 'user-3', roleId: 'role-operator' },
  { userId: 'user-4', roleId: 'role-operator' },
  { userId: 'user-t2-1', roleId: 'role-tenant-admin' },
  { userId: 'user-t2-2', roleId: 'role-operator' },
];

// ============ Agent Governance Data ============
export const mockAgentGovernance: AgentGovernance[] = [
  {
    agentId: 'agent-1',
    riskLevel: 'medium',
    usageType: 'operational',
    autonomyLevel: 3,
    policies: ['policy-1'],
    lifecycleStage: 'production',
    riskAssessment: {
      lastAssessmentDate: new Date('2024-01-20'),
      nextReviewDate: new Date('2024-07-20'),
      methodology: 'ISO_23894_B',
      riskScore: 45,
      residualRiskLevel: 'medium',
      mitigationStatus: 'verified'
    }
  },
  {
    agentId: 'agent-2',
    riskLevel: 'low',
    usageType: 'informational',
    autonomyLevel: 4,
    policies: ['policy-1'],
    lifecycleStage: 'production',
    riskAssessment: {
      lastAssessmentDate: new Date('2024-02-10'),
      nextReviewDate: new Date('2024-08-10'),
      methodology: 'ISO_23894_B',
      riskScore: 12,
      residualRiskLevel: 'low',
      mitigationStatus: 'implemented'
    }
  },
  {
    agentId: 'agent-3',
    riskLevel: 'high',
    usageType: 'sensitive',
    autonomyLevel: 2,
    policies: ['policy-1', 'policy-2'],
    lifecycleStage: 'validation', // Not fully production yet due to high risk
    riskAssessment: {
      lastAssessmentDate: new Date('2024-03-01'),
      nextReviewDate: new Date('2024-04-01'), // Monthly review for high risk
      methodology: 'NIST_AI_RMF',
      riskScore: 78,
      residualRiskLevel: 'high',
      mitigationStatus: 'planned'
    }
  },
  {
    agentId: 'agent-4',
    riskLevel: 'medium',
    usageType: 'operational',
    autonomyLevel: 3,
    policies: ['policy-1'],
    lifecycleStage: 'retired',
  },
];

// ============ AI Policies ============
export const mockAIPolicies: AIPolicy[] = [
  {
    id: 'policy-1',
    tenantId: 'tenant-1',
    name: 'Política Geral de Atendimento',
    version: '2.1',
    createdAt: new Date('2024-06-15'),
    rules: {
      canDo: [
        'Responder perguntas sobre produtos e serviços',
        'Consultar saldo e extrato',
        'Agendar atendimentos',
        'Fornecer informações de horários e locais',
        'Orientar sobre procedimentos básicos',
      ],
      cannotDo: [
        'Realizar transações financeiras acima de R$ 1.000',
        'Alterar dados cadastrais sensíveis',
        'Fornecer informações de outros clientes',
        'Fazer promessas de aprovação de crédito',
        'Cancelar contratos ou serviços',
      ],
      transferConditions: [
        'Cliente solicita falar com humano',
        'Mais de 3 tentativas sem resolução',
        'Detecção de frustração ou raiva',
        'Assuntos relacionados a fraude',
        'Reclamações sobre cobranças indevidas',
      ],
    },
    isActive: true,
  },
  {
    id: 'policy-2',
    tenantId: 'tenant-1',
    name: 'Política de Vendas',
    version: '1.0',
    createdAt: new Date('2024-09-01'),
    rules: {
      canDo: [
        'Apresentar produtos e serviços',
        'Simular valores e condições',
        'Coletar interesse do cliente',
        'Agendar contato comercial',
      ],
      cannotDo: [
        'Fechar contratos',
        'Oferecer descontos não autorizados',
        'Garantir aprovação de crédito',
      ],
      transferConditions: [
        'Cliente pronto para contratar',
        'Negociação de condições especiais',
        'Dúvidas técnicas complexas',
      ],
    },
    isActive: true,
  },
];

// ============ AI Decision Logs ============
export const mockAIDecisionLogs: AIDecisionLog[] = [
  {
    id: 'log-1',
    conversationId: 'conv-1',
    messageId: 'conv-1-msg-6',
    agentId: 'agent-1',
    flowId: 'flow-1',
    timestamp: new Date(Date.now() - 3300000),
    decision: 'Transferir para humano',
    autonomyUsed: 2,
    humanOverride: false,
    reasoning: 'Detectada frustração do usuário após múltiplas tentativas de resolver problema de acesso. Política define transferência após 3 tentativas.',
  },
  {
    id: 'log-2',
    conversationId: 'conv-2',
    messageId: 'conv-2-msg-3',
    agentId: 'agent-1',
    flowId: 'flow-2',
    timestamp: new Date(Date.now() - 120000),
    decision: 'Consultar saldo',
    autonomyUsed: 4,
    humanOverride: false,
    reasoning: 'Solicitação direta de consulta de saldo. Ação permitida pela política. Executada automaticamente.',
  },
  {
    id: 'log-3',
    conversationId: 'conv-3',
    messageId: 'conv-3-msg-2',
    agentId: 'agent-2',
    timestamp: new Date(Date.now() - 300000),
    decision: 'Fornecer orientação',
    autonomyUsed: 4,
    humanOverride: false,
    reasoning: 'Pergunta sobre atualização cadastral. Fornecidas instruções padrão.',
  },
  {
    id: 'log-4',
    conversationId: 'conv-5',
    messageId: 'conv-5-msg-4',
    agentId: 'agent-3',
    flowId: 'flow-3',
    timestamp: new Date(Date.now() - 900000),
    decision: 'Iniciar simulação de crédito',
    autonomyUsed: 3,
    humanOverride: true,
    overrideBy: 'Marina Costa',
    reasoning: 'Cliente interessado em cartão premium. Operadora assumiu para negociação personalizada.',
  },
];

// ============ AI Incidents ============
// ============ AI Incidents ============
export const mockAIIncidents: AIIncident[] = [
  {
    id: 'incident-1',
    tenantId: 'tenant-1',
    conversationId: 'conv-old-1',
    agentId: 'agent-1',
    severity: 'medium',
    title: 'Resposta incorreta sobre taxas',
    description: 'Agente informou taxa de juros desatualizada para empréstimo pessoal.',
    createdAt: new Date('2025-01-20T14:30:00'),
    resolvedAt: new Date('2025-01-20T16:45:00'),
    status: 'resolved',
    actionTaken: 'Base de conhecimento atualizada com novas taxas. Cliente contatado com informação correta.',
    reportedBy: 'Pedro Santos',
    attachments: [],
  },
  {
    id: 'incident-2',
    tenantId: 'tenant-1',
    agentId: 'agent-2',
    severity: 'low',
    title: 'Tempo de resposta elevado',
    description: 'Agente levou mais de 30s para responder durante pico de acessos.',
    createdAt: new Date('2025-01-25T10:15:00'),
    status: 'investigating',
    reportedBy: 'Ana Rodrigues',
    attachments: [],
  },
  {
    id: 'incident-3',
    tenantId: 'tenant-1',
    conversationId: 'conv-old-2',
    agentId: 'agent-3',
    severity: 'high',
    title: 'Informação sensível exposta',
    description: 'Agente mencionou dados de outro cliente durante atendimento.',
    createdAt: new Date('2025-01-28T09:00:00'),
    status: 'open',
    reportedBy: 'Carlos Silva',
    attachments: [],
  },
  {
    // ISO 42001 Audit Simulation Incident
    id: 'incident-4',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    severity: 'medium',
    title: 'Desvio de Trustworthiness (Viés Halluzinatório)',
    description: 'Auditoria detectou respostas com confiança excessiva em dados não verificados. Incidente aberto para reavaliação de risco conforme ISO 23894.',
    createdAt: new Date('2025-02-01T08:00:00'),
    status: 'investigating',
    reportedBy: 'Ana Rodrigues (Risk Owner)',
    actionTaken: 'Agente movido para estágio "Validation" até nova calibração.',
    attachments: [],
  },
];

// ============ Conversational Flows ============
export const mockFlows: ConversationalFlow[] = [
  {
    id: 'flow-1',
    tenant_id: 'tenant-1',
    tenantSlug: 'banco-alpha',
    name: 'Suporte Técnico - Acesso',
    description: 'Fluxo para resolução de problemas de acesso ao aplicativo',
    objective: 'Restaurar acesso do cliente ao app mobile ou internet banking',
    type: 'inbound',
    linked_agents: ['agent-1', 'agent-2'],
    stages: [
      { id: 'st-1', name: 'Identificação', order: 1, type: 'greeting', description: 'Identificar cliente e problema', expected_outcome: 'Cliente identificado', escalation_allowed: false, actor_type: 'ai' },
      { id: 'st-2', name: 'Diagnóstico', order: 2, type: 'qualification', description: 'Identificar tipo de erro de acesso', expected_outcome: 'Tipo de erro mapeado', escalation_allowed: false, actor_type: 'ai' },
      { id: 'st-3', name: 'Resolução Auto', order: 3, type: 'resolution', description: 'Tentar reset de senha ou desbloqueio', expected_outcome: 'Acesso restaurado', escalation_allowed: true, escalation_rule: 'fallback_humano_se_erro_3x', actor_type: 'ai' },
      { id: 'st-4', name: 'Escalonamento', order: 4, type: 'handoff', description: 'Transferir se não resolver', expected_outcome: 'Humano assumiu', escalation_allowed: false, actor_type: 'human' },
      { id: 'st-5', name: 'Confirmação', order: 5, type: 'closing', description: 'Confirmar resolução e encerrar', expected_outcome: 'Resolução validada', escalation_allowed: false, actor_type: 'both' },
    ],
    success_criteria: 'Cliente consegue acessar a conta com sucesso',
    status: 'active',
    createdAt: new Date('2024-08-01'),
  },
  {
    id: 'flow-2',
    tenant_id: 'tenant-1',
    tenantSlug: 'banco-alpha',
    name: 'Consulta de Saldo e Extrato',
    description: 'Fluxo simples para consultas de saldo e movimentações',
    objective: 'Fornecer informações de saldo e extrato ao cliente',
    type: 'inbound',
    linked_agents: ['agent-1'],
    stages: [
      { id: 'st-1', name: 'Saudação', order: 1, type: 'greeting', description: 'Cumprimentar e validar identidade', expected_outcome: 'Identidade validada', escalation_allowed: false, actor_type: 'ai' },
      { id: 'st-2', name: 'Consulta', order: 2, type: 'resolution', description: 'Realizar consulta solicitada', expected_outcome: 'Extrato exibido', escalation_allowed: true, escalation_rule: 'transferir_se_duvida_complexa', actor_type: 'ai' },
      { id: 'st-3', name: 'Encerramento', order: 3, type: 'closing', description: 'Confirmar e encerrar', expected_outcome: 'Chamado concluído', escalation_allowed: false, actor_type: 'ai' },
    ],
    success_criteria: 'Cliente recebe informação solicitada',
    status: 'active',
    createdAt: new Date('2024-07-15'),
  },
  {
    id: 'flow-3',
    tenant_id: 'tenant-1',
    tenantSlug: 'banco-alpha',
    name: 'Campanha Cartão Premium',
    description: 'Fluxo outbound para oferta de upgrade de cartão',
    objective: 'Converter clientes elegíveis para cartão premium',
    type: 'outbound',
    linked_agents: ['agent-3'],
    stages: [
      { id: 'st-1', name: 'Contato Inicial', order: 1, type: 'greeting', description: 'Apresentar oferta de forma não invasiva', expected_outcome: 'Atenção captada', escalation_allowed: false, actor_type: 'ai' },
      { id: 'st-2', name: 'Qualificação', order: 2, type: 'qualification', description: 'Verificar interesse e perfil', expected_outcome: 'Persona validada', escalation_allowed: false, actor_type: 'ai' },
      { id: 'st-3', name: 'Apresentação', order: 3, type: 'resolution', description: 'Detalhar benefícios e condições', expected_outcome: 'Benefícios aceitos', escalation_allowed: true, escalation_rule: 'transfer_se_interesse_alto', actor_type: 'ai' },
      { id: 'st-4', name: 'Conversão', order: 4, type: 'handoff', description: 'Transferir para fechamento comercial', expected_outcome: 'Assinatura realizada', escalation_allowed: false, actor_type: 'human' },
      { id: 'st-5', name: 'Follow-up', order: 5, type: 'closing', description: 'Registrar interesse ou recusa', expected_outcome: 'Histórico salvo', escalation_allowed: false, actor_type: 'ai' },
    ],
    success_criteria: 'Cliente aceita upgrade ou agendamento de contato',
    status: 'active',
    createdAt: new Date('2024-11-01'),
  },
  {
    id: 'flow-4',
    tenant_id: 'tenant-1',
    tenantSlug: 'banco-alpha',
    name: 'Cobrança Amigável',
    description: 'Fluxo outbound para negociação de débitos',
    objective: 'Recuperar valores em atraso através de negociação',
    type: 'outbound',
    linked_agents: ['agent-4'],
    stages: [
      { id: 'st-1', name: 'Contato', order: 1, type: 'greeting', description: 'Contato cordial sobre débito', expected_outcome: 'Conversa iniciada', escalation_allowed: false, actor_type: 'ai' },
      { id: 'st-2', name: 'Negociação', order: 2, type: 'resolution', description: 'Apresentar opções de pagamento', expected_outcome: 'Acordo proposto', escalation_allowed: true, escalation_rule: 'escalar_se_recusa_proposta', actor_type: 'ai' },
      { id: 'st-3', name: 'Fechamento', order: 3, type: 'closing', description: 'Confirmar acordo ou reagendar', expected_outcome: 'Acordo fechado', escalation_allowed: false, actor_type: 'both' },
    ],
    success_criteria: 'Acordo de pagamento fechado',
    status: 'inactive',
    createdAt: new Date('2024-10-01'),
  },
];

// ============ Success Metrics ============
export const mockSuccessMetrics: SuccessMetrics = {
  tenantId: 'tenant-1',
  period: 'Janeiro 2026',
  totalConversations: 45672,
  successfulConversations: 38421,
  overallSuccessRate: 84.1,
  avgTimeToResolution: 245, // seconds
  humanInterventions: 7251,
  byFlow: [
    {
      flowId: 'flow-1',
      flowName: 'Suporte Técnico - Acesso',
      totalConversations: 12453,
      successfulConversations: 9962,
      successRate: 80.0,
      avgCompletionTime: 312,
      humanInterventions: 3112,
      humanInterventionRate: 25.0,
    },
    {
      flowId: 'flow-2',
      flowName: 'Consulta de Saldo e Extrato',
      totalConversations: 24521,
      successfulConversations: 23795,
      successRate: 97.0,
      avgCompletionTime: 45,
      humanInterventions: 245,
      humanInterventionRate: 1.0,
    },
    {
      flowId: 'flow-3',
      flowName: 'Campanha Cartão Premium',
      totalConversations: 8698,
      successfulConversations: 4664,
      successRate: 53.6,
      avgCompletionTime: 480,
      humanInterventions: 3894,
      humanInterventionRate: 44.8,
    },
  ],
};

// ============ Audit Logs (Enterprise) ============
export const mockAuditLogs: AuditLog[] = [
  {
    id: 'audit-1',
    timestamp: new Date(Date.now() - 7200000), // 2 hours ago
    tenantId: 'tenant-1',
    tenantSlug: 'banco-alpha',
    actorId: 'user-1',
    actorName: 'Carlos Silva',
    action: 'auth.login',
    targetType: 'system',
    details: 'Login bem-sucedido via 2FA',
    ipAddress: '200.158.42.10',
  },
  {
    id: 'audit-2',
    timestamp: new Date(Date.now() - 3600000),
    tenantId: 'tenant-1',
    tenantSlug: 'banco-alpha',
    actorId: 'user-2',
    actorName: 'Ana Rodrigues',
    action: 'agent.update',
    targetType: 'agent',
    targetId: 'agent-1',
    details: 'Alteração de System Prompt e Nível de Risco (Medium -> High)',
  },
  {
    id: 'audit-3',
    timestamp: new Date(Date.now() - 1800000),
    tenantId: 'tenant-1',
    tenantSlug: 'banco-alpha',
    actorId: 'system',
    actorName: 'System Core',
    action: 'data.anonymize',
    targetType: 'conversation',
    targetId: 'conv-old-15',
    details: 'Rotina automática de anonimização (Retenção > 90 dias)',
  },
  {
    id: 'audit-4',
    timestamp: new Date(Date.now() - 900000),
    tenantId: 'tenant-1',
    tenantSlug: 'banco-alpha',
    actorId: 'user-1',
    actorName: 'Carlos Silva',
    action: 'auth.impersonate',
    targetType: 'tenant',
    targetId: 'tenant-2',
    details: 'Acesso Administrativo ao ambiente Seguradora Beta',
  },
];

// ============ Channel Events (N8N Simulation) ============
export const mockChannelEvents: ChannelEvent[] = [
  {
    id: 'evt-1',
    eventId: 'n8n-webhook-12345',
    eventType: 'message.received',
    timestamp: new Date(Date.now() - 60000),
    tenantId: 'tenant-1',
    tenantSlug: 'banco-alpha',
    externalId: 'WA_SID_MOCK_123',
    metadata: { channel: 'whatsapp', sender: '+5511999999999', content_type: 'text' },
  },
  {
    id: 'evt-2',
    eventId: 'evt-call-9876',
    externalId: 'retell_call_9876',
    eventType: 'voice.call.ended',
    timestamp: new Date(Date.now() - 120000),
    tenantId: 'tenant-1',
    tenantSlug: 'banco-alpha',
    metadata: { duration: 145, sentiment: 'positive', recording_url: 's3://bucket/rec.mp3' },
  },
];

// ============ Enterprise SLA Config ============
export const mockSLAConfig: SLAConfiguration[] = [
  {
    id: 'sla-t1-whatsapp',
    tenantId: 'tenant-1',
    channel: 'whatsapp',
    firstResponseTimeSeconds: 60,
    resolutionTimeMinutes: 15,
    maxHumanFallbackRate: 15.0,
    operatingHours: '24x7',
  },
];

// ============ LGPD DSAR Operations ============
export const mockDSARRequests: DSARRequest[] = [
  {
    id: 'dsar-1',
    tenantId: 'tenant-1',
    subjectId: 'cust-554',
    requestType: 'deletion',
    status: 'completed',
    requestDate: new Date('2024-01-15'),
    completionDate: new Date('2024-01-18'),
    evidenceRef: 'audit-log-5541',
  },
];

// ============ Extended User Data with Roles ============
// ============ Consumption & Metrics Data (Etapa 1-7) ============
import { ConsumptionMetrics, PeakUsageMatrix, ConsumptionChannel, MetricType } from './types';
import { COST_RATES } from './consumption-logic';

const generateDetailedMockMetrics = (): ConsumptionMetrics[] => {
  const metrics: ConsumptionMetrics[] = [];
  const channels: ConsumptionChannel[] = ['whatsapp', 'voice', 'text'];
  const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4'];
  const now = new Date();

  // Create 30 days of data
  for (let i = 0; i < 30; i++) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

    agents.forEach(agentId => {
      channels.forEach(channel => {
        // Daily tokens
        const tokensValue = Math.floor(Math.random() * 50000) + 10000;
        metrics.push({
          id: `m-${day.getTime()}-${agentId}-${channel}-tk`,
          tenantId: 'tenant-1',
          tenantSlug: 'banco-alpha',
          agentId,
          channel,
          metricType: 'tokens',
          value: tokensValue,
          unit: 'tokens',
          cost: (tokensValue / 1000) * 0.10, // R$ 0.10 per 1k
          timestamp: day
        });

        // Daily messages
        const msgValue = Math.floor(Math.random() * 500) + 50;
        metrics.push({
          id: `m-${day.getTime()}-${agentId}-${channel}-msg`,
          tenantId: 'tenant-1',
          tenantSlug: 'banco-alpha',
          agentId,
          channel,
          metricType: 'messages',
          value: msgValue,
          unit: 'units',
          cost: msgValue * 0.01,
          timestamp: day
        });

        if (channel === 'voice') {
          // Voice specific
          const sttValue = Math.floor(Math.random() * 60) + 10;
          metrics.push({
            id: `m-${day.getTime()}-${agentId}-${channel}-stt`,
            tenantId: 'tenant-1',
            tenantSlug: 'banco-alpha',
            agentId,
            channel,
            metricType: 'stt_minutes',
            value: sttValue,
            unit: 'minutes',
            cost: sttValue * 0.05,
            timestamp: day
          });

          const ttsValue = sttValue * 0.8; // Simulating TTS as proportion of STT
          metrics.push({
            id: `m-${day.getTime()}-${agentId}-${channel}-tts`,
            tenantId: 'tenant-1',
            tenantSlug: 'banco-alpha',
            agentId,
            channel,
            metricType: 'tts_minutes',
            value: ttsValue,
            unit: 'minutes',
            cost: ttsValue * 0.05,
            timestamp: day
          });
        }
      });
    });
  }
  return metrics;
};

export const mockConsumptionMetrics: ConsumptionMetrics[] = generateDetailedMockMetrics();

// Helper to get heatmap from mock data
export const getMockPeakUsage = (): PeakUsageMatrix[] => {
  const matrix: PeakUsageMatrix[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      // Simulate higher usage during business hours (9-18)
      const isBusinessHour = h >= 9 && h <= 18;
      const baseIntensity = isBusinessHour ? 0.6 : 0.1;
      const randomFactor = Math.random() * 0.4;
      const intensity = Math.min(baseIntensity + randomFactor, 1);

      matrix.push({
        dayOfWeek: d,
        hourOfDay: h,
        intensity: intensity,
        eventCount: Math.floor(intensity * 100)
      });
    }
  }
  return matrix;
};

export const mockPeakUsageMatrix: PeakUsageMatrix[] = getMockPeakUsage();
