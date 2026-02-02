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
  DEFAULT_ROLES
} from './types';

// ============ Mock Companies ============
export const mockCompanies: Company[] = [
  {
    id: 'tenant-1',
    name: 'Banco Digital Alpha',
    slug: 'banco-alpha',
    plan: 'enterprise',
    status: 'active',
    createdAt: new Date('2024-01-15'),
    limits: {
      llmTokens: 5000000,
      messages: 100000,
      sttMinutes: 3000,
      ttsMinutes: 2000,
      agents: 10,
      users: 50,
    },
    settings: {
      aiNoticeMessage: 'Esta conversa pode ser assistida por inteligência artificial. Seus dados são tratados conforme nossa política de privacidade.',
      retentionDays: 365,
      anonymizationEnabled: true,
    },
  },
  {
    id: 'tenant-2',
    name: 'Seguradora Beta',
    slug: 'seguradora-beta',
    plan: 'pro',
    status: 'active',
    createdAt: new Date('2024-03-22'),
    limits: {
      llmTokens: 2000000,
      messages: 50000,
      sttMinutes: 1500,
      ttsMinutes: 1000,
      agents: 5,
      users: 20,
    },
    settings: {
      aiNoticeMessage: 'Você está conversando com um assistente virtual.',
      retentionDays: 180,
      anonymizationEnabled: false,
    },
  },
  {
    id: 'tenant-3',
    name: 'Fintech Gamma',
    slug: 'fintech-gamma',
    plan: 'free',
    status: 'trial',
    createdAt: new Date('2025-01-10'),
    limits: {
      llmTokens: 100000,
      messages: 5000,
      sttMinutes: 100,
      ttsMinutes: 50,
      agents: 2,
      users: 5,
    },
    settings: {
      aiNoticeMessage: 'Este chat usa IA para auxiliar no atendimento.',
      retentionDays: 30,
      anonymizationEnabled: false,
    },
  },
  {
    id: 'tenant-4',
    name: 'Varejo Delta',
    slug: 'varejo-delta',
    plan: 'pro',
    status: 'suspended',
    createdAt: new Date('2024-06-01'),
    limits: {
      llmTokens: 2000000,
      messages: 50000,
      sttMinutes: 1500,
      ttsMinutes: 1000,
      agents: 5,
      users: 20,
    },
    settings: {
      aiNoticeMessage: 'Atendimento automatizado.',
      retentionDays: 90,
      anonymizationEnabled: true,
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

// ============ Agent Governance Data ============
export const mockAgentGovernance: AgentGovernance[] = [
  {
    agentId: 'agent-1',
    riskLevel: 'medium',
    usageType: 'operational',
    autonomyLevel: 3,
    policies: ['policy-1'],
  },
  {
    agentId: 'agent-2',
    riskLevel: 'low',
    usageType: 'informational',
    autonomyLevel: 4,
    policies: ['policy-1'],
  },
  {
    agentId: 'agent-3',
    riskLevel: 'high',
    usageType: 'sensitive',
    autonomyLevel: 2,
    policies: ['policy-1', 'policy-2'],
  },
  {
    agentId: 'agent-4',
    riskLevel: 'medium',
    usageType: 'operational',
    autonomyLevel: 3,
    policies: ['policy-1'],
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
  },
];

// ============ Conversational Flows ============
export const mockFlows: ConversationalFlow[] = [
  {
    id: 'flow-1',
    tenantId: 'tenant-1',
    name: 'Suporte Técnico - Acesso',
    description: 'Fluxo para resolução de problemas de acesso ao aplicativo',
    objective: 'Restaurar acesso do cliente ao app mobile ou internet banking',
    type: 'inbound',
    agentIds: ['agent-1', 'agent-2'],
    steps: [
      { id: 'step-1', name: 'Identificação', order: 1, type: 'greeting', description: 'Identificar cliente e problema' },
      { id: 'step-2', name: 'Diagnóstico', order: 2, type: 'qualification', description: 'Identificar tipo de erro de acesso' },
      { id: 'step-3', name: 'Resolução Auto', order: 3, type: 'resolution', description: 'Tentar reset de senha ou desbloqueio' },
      { id: 'step-4', name: 'Escalonamento', order: 4, type: 'handoff', description: 'Transferir se não resolver' },
      { id: 'step-5', name: 'Confirmação', order: 5, type: 'closing', description: 'Confirmar resolução e encerrar' },
    ],
    successCriteria: 'Cliente consegue acessar a conta com sucesso',
    isActive: true,
    createdAt: new Date('2024-08-01'),
  },
  {
    id: 'flow-2',
    tenantId: 'tenant-1',
    name: 'Consulta de Saldo e Extrato',
    description: 'Fluxo simples para consultas de saldo e movimentações',
    objective: 'Fornecer informações de saldo e extrato ao cliente',
    type: 'inbound',
    agentIds: ['agent-1'],
    steps: [
      { id: 'step-1', name: 'Saudação', order: 1, type: 'greeting', description: 'Cumprimentar e validar identidade' },
      { id: 'step-2', name: 'Consulta', order: 2, type: 'resolution', description: 'Realizar consulta solicitada' },
      { id: 'step-3', name: 'Encerramento', order: 3, type: 'closing', description: 'Confirmar e encerrar' },
    ],
    successCriteria: 'Cliente recebe informação solicitada',
    isActive: true,
    createdAt: new Date('2024-07-15'),
  },
  {
    id: 'flow-3',
    tenantId: 'tenant-1',
    name: 'Campanha Cartão Premium',
    description: 'Fluxo outbound para oferta de upgrade de cartão',
    objective: 'Converter clientes elegíveis para cartão premium',
    type: 'outbound',
    agentIds: ['agent-3'],
    steps: [
      { id: 'step-1', name: 'Contato Inicial', order: 1, type: 'greeting', description: 'Apresentar oferta de forma não invasiva' },
      { id: 'step-2', name: 'Qualificação', order: 2, type: 'qualification', description: 'Verificar interesse e perfil' },
      { id: 'step-3', name: 'Apresentação', order: 3, type: 'resolution', description: 'Detalhar benefícios e condições' },
      { id: 'step-4', name: 'Conversão', order: 4, type: 'handoff', description: 'Transferir para fechamento comercial' },
      { id: 'step-5', name: 'Follow-up', order: 5, type: 'closing', description: 'Registrar interesse ou recusa' },
    ],
    successCriteria: 'Cliente aceita upgrade ou agendamento de contato',
    isActive: true,
    createdAt: new Date('2024-11-01'),
  },
  {
    id: 'flow-4',
    tenantId: 'tenant-1',
    name: 'Cobrança Amigável',
    description: 'Fluxo outbound para negociação de débitos',
    objective: 'Recuperar valores em atraso através de negociação',
    type: 'outbound',
    agentIds: ['agent-4'],
    steps: [
      { id: 'step-1', name: 'Contato', order: 1, type: 'greeting', description: 'Contato cordial sobre débito' },
      { id: 'step-2', name: 'Negociação', order: 2, type: 'resolution', description: 'Apresentar opções de pagamento' },
      { id: 'step-3', name: 'Fechamento', order: 3, type: 'closing', description: 'Confirmar acordo ou reagendar' },
    ],
    successCriteria: 'Acordo de pagamento fechado',
    isActive: false,
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

// ============ Extended User Data with Roles ============
export const mockUserRoles = [
  { userId: 'user-1', roleId: 'role-super-admin' },
  { userId: 'user-2', roleId: 'role-tenant-admin' },
  { userId: 'user-3', roleId: 'role-operator' },
  { userId: 'user-4', roleId: 'role-operator' },
];
