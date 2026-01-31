// Mock Data for Davos Nexus Dashboard

export interface Tenant {
  id: string;
  name: string;
  plan: 'starter' | 'professional' | 'enterprise';
  logo?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'tenant_admin' | 'operator';
  tenantId: string;
  avatar?: string;
}

export interface Agent {
  id: string;
  name: string;
  tenantId: string;
  status: 'active' | 'inactive';
  channels: ('text' | 'voice')[];
  totalConversations: number;
  activeConversations: number;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: 'text' | 'audio' | 'image';
  sender: 'user' | 'ai' | 'human';
  senderName?: string;
  timestamp: Date;
  audioUrl?: string;
  imageUrl?: string;
  transcription?: string;
}

export interface Conversation {
  id: string;
  tenantId: string;
  agentId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  channel: 'text' | 'voice';
  status: 'ai_active' | 'human_active' | 'closed';
  assignedOperator?: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
}

export interface ConsumptionData {
  tenantId: string;
  period: string;
  llmTokens: number;
  messagesProcessed: number;
  sttMinutes: number;
  ttsMinutes: number;
  planLimit: {
    llmTokens: number;
    messages: number;
    sttMinutes: number;
    ttsMinutes: number;
  };
  costBreakdown: {
    llm: number;
    stt: number;
    tts: number;
    total: number;
  };
  byAgent: {
    agentId: string;
    agentName: string;
    tokens: number;
    messages: number;
    cost: number;
  }[];
  byChannel: {
    channel: 'text' | 'voice';
    tokens: number;
    messages: number;
    cost: number;
  }[];
  dailyUsage: {
    date: string;
    tokens: number;
    messages: number;
    cost: number;
  }[];
}

export interface Alert {
  id: string;
  tenantId: string;
  type: 'warning' | 'critical' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

// Mock Tenants
export const mockTenants: Tenant[] = [
  { id: 'tenant-1', name: 'Banco Digital Alpha', plan: 'enterprise' },
  { id: 'tenant-2', name: 'Seguradora Beta', plan: 'professional' },
  { id: 'tenant-3', name: 'Fintech Gamma', plan: 'starter' },
];

// Mock Users
export const mockUsers: User[] = [
  { id: 'user-1', name: 'Carlos Silva', email: 'carlos@davos.ai', role: 'super_admin', tenantId: 'davos', avatar: 'CS' },
  { id: 'user-2', name: 'Ana Rodrigues', email: 'ana@bancoalpha.com', role: 'tenant_admin', tenantId: 'tenant-1', avatar: 'AR' },
  { id: 'user-3', name: 'Pedro Santos', email: 'pedro@bancoalpha.com', role: 'operator', tenantId: 'tenant-1', avatar: 'PS' },
  { id: 'user-4', name: 'Marina Costa', email: 'marina@bancoalpha.com', role: 'operator', tenantId: 'tenant-1', avatar: 'MC' },
];

// Mock Agents
export const mockAgents: Agent[] = [
  { id: 'agent-1', name: 'Atendimento Geral', tenantId: 'tenant-1', status: 'active', channels: ['text', 'voice'], totalConversations: 15234, activeConversations: 47 },
  { id: 'agent-2', name: 'Suporte Técnico', tenantId: 'tenant-1', status: 'active', channels: ['text'], totalConversations: 8921, activeConversations: 23 },
  { id: 'agent-3', name: 'Vendas', tenantId: 'tenant-1', status: 'active', channels: ['text', 'voice'], totalConversations: 5673, activeConversations: 12 },
  { id: 'agent-4', name: 'Cobrança', tenantId: 'tenant-1', status: 'inactive', channels: ['voice'], totalConversations: 3421, activeConversations: 0 },
];

// Generate mock messages for a conversation
const generateMockMessages = (conversationId: string): Message[] => {
  const messages: Message[] = [
    {
      id: `${conversationId}-msg-1`,
      conversationId,
      content: 'Olá, preciso de ajuda com minha conta.',
      type: 'text',
      sender: 'user',
      timestamp: new Date(Date.now() - 3600000),
    },
    {
      id: `${conversationId}-msg-2`,
      conversationId,
      content: 'Olá! Sou o assistente virtual do Banco Alpha. Como posso ajudá-lo hoje?',
      type: 'text',
      sender: 'ai',
      timestamp: new Date(Date.now() - 3540000),
    },
    {
      id: `${conversationId}-msg-3`,
      conversationId,
      content: 'Não consigo acessar o aplicativo, aparece uma mensagem de erro.',
      type: 'text',
      sender: 'user',
      timestamp: new Date(Date.now() - 3480000),
    },
    {
      id: `${conversationId}-msg-4`,
      conversationId,
      content: 'Entendo sua frustração. Pode me informar qual mensagem de erro está aparecendo? Isso vai me ajudar a identificar o problema mais rapidamente.',
      type: 'text',
      sender: 'ai',
      timestamp: new Date(Date.now() - 3420000),
    },
    {
      id: `${conversationId}-msg-5`,
      conversationId,
      content: '',
      type: 'audio',
      sender: 'user',
      audioUrl: '/mock-audio.mp3',
      transcription: 'Aparece escrito "Erro de autenticação, tente novamente mais tarde"',
      timestamp: new Date(Date.now() - 3360000),
    },
    {
      id: `${conversationId}-msg-6`,
      conversationId,
      content: 'Obrigado pela informação. Esse erro geralmente ocorre quando há muitas tentativas de login. Vou transferir você para um atendente que pode resolver isso rapidamente.',
      type: 'text',
      sender: 'ai',
      timestamp: new Date(Date.now() - 3300000),
    },
    {
      id: `${conversationId}-msg-7`,
      conversationId,
      content: '🔄 Conversa transferida para atendente humano',
      type: 'text',
      sender: 'ai',
      timestamp: new Date(Date.now() - 3240000),
    },
    {
      id: `${conversationId}-msg-8`,
      conversationId,
      content: 'Olá! Meu nome é Pedro, vou te ajudar com esse problema de acesso. Já identifiquei o bloqueio na sua conta. Vou desbloquear agora.',
      type: 'text',
      sender: 'human',
      senderName: 'Pedro Santos',
      timestamp: new Date(Date.now() - 3180000),
    },
    {
      id: `${conversationId}-msg-9`,
      conversationId,
      content: 'Ótimo, muito obrigado!',
      type: 'text',
      sender: 'user',
      timestamp: new Date(Date.now() - 3120000),
    },
    {
      id: `${conversationId}-msg-10`,
      conversationId,
      content: 'Pronto! Sua conta foi desbloqueada. Pode tentar acessar novamente. Se precisar de mais alguma coisa, estou à disposição.',
      type: 'text',
      sender: 'human',
      senderName: 'Pedro Santos',
      timestamp: new Date(Date.now() - 3060000),
    },
  ];
  return messages;
};

// Mock Conversations
export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    userId: 'client-1',
    userName: 'João Oliveira',
    channel: 'text',
    status: 'human_active',
    assignedOperator: 'Pedro Santos',
    lastMessage: 'Pronto! Sua conta foi desbloqueada.',
    lastMessageTime: new Date(Date.now() - 60000),
    unreadCount: 0,
    messages: generateMockMessages('conv-1'),
  },
  {
    id: 'conv-2',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    userId: 'client-2',
    userName: 'Maria Fernandes',
    channel: 'voice',
    status: 'ai_active',
    lastMessage: 'Posso consultar seu saldo agora mesmo.',
    lastMessageTime: new Date(Date.now() - 120000),
    unreadCount: 2,
    messages: [],
  },
  {
    id: 'conv-3',
    tenantId: 'tenant-1',
    agentId: 'agent-2',
    userId: 'client-3',
    userName: 'Roberto Almeida',
    channel: 'text',
    status: 'ai_active',
    lastMessage: 'Como faço para atualizar meus dados?',
    lastMessageTime: new Date(Date.now() - 300000),
    unreadCount: 1,
    messages: [],
  },
  {
    id: 'conv-4',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    userId: 'client-4',
    userName: 'Carla Mendes',
    channel: 'text',
    status: 'human_active',
    assignedOperator: 'Marina Costa',
    lastMessage: 'Estou aguardando a confirmação.',
    lastMessageTime: new Date(Date.now() - 600000),
    unreadCount: 0,
    messages: [],
  },
  {
    id: 'conv-5',
    tenantId: 'tenant-1',
    agentId: 'agent-3',
    userId: 'client-5',
    userName: 'Lucas Ribeiro',
    channel: 'voice',
    status: 'ai_active',
    lastMessage: 'Tenho interesse no cartão premium.',
    lastMessageTime: new Date(Date.now() - 900000),
    unreadCount: 3,
    messages: [],
  },
  {
    id: 'conv-6',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    userId: 'client-6',
    userName: 'Fernanda Lima',
    channel: 'text',
    status: 'ai_active',
    lastMessage: 'Quero saber sobre investimentos.',
    lastMessageTime: new Date(Date.now() - 1800000),
    unreadCount: 0,
    messages: [],
  },
];

// Mock Consumption Data
export const mockConsumption: ConsumptionData = {
  tenantId: 'tenant-1',
  period: 'Janeiro 2026',
  llmTokens: 2847521,
  messagesProcessed: 45672,
  sttMinutes: 1234,
  ttsMinutes: 892,
  planLimit: {
    llmTokens: 5000000,
    messages: 100000,
    sttMinutes: 3000,
    ttsMinutes: 2000,
  },
  costBreakdown: {
    llm: 284.75,
    stt: 61.70,
    tts: 44.60,
    total: 391.05,
  },
  byAgent: [
    { agentId: 'agent-1', agentName: 'Atendimento Geral', tokens: 1523847, messages: 24521, cost: 198.45 },
    { agentId: 'agent-2', agentName: 'Suporte Técnico', tokens: 847251, messages: 12453, cost: 112.30 },
    { agentId: 'agent-3', agentName: 'Vendas', tokens: 476423, messages: 8698, cost: 80.30 },
  ],
  byChannel: [
    { channel: 'text', tokens: 1987654, messages: 32145, cost: 245.80 },
    { channel: 'voice', tokens: 859867, messages: 13527, cost: 145.25 },
  ],
  dailyUsage: Array.from({ length: 30 }, (_, i) => ({
    date: `${i + 1}/01`,
    tokens: Math.floor(80000 + Math.random() * 40000),
    messages: Math.floor(1200 + Math.random() * 800),
    cost: Math.floor(10 + Math.random() * 8),
  })),
};

// Mock Alerts
export const mockAlerts: Alert[] = [
  {
    id: 'alert-1',
    tenantId: 'tenant-1',
    type: 'warning',
    title: 'Consumo de tokens em 57%',
    message: 'Você já utilizou 57% do limite mensal de tokens LLM.',
    timestamp: new Date(Date.now() - 3600000),
    read: false,
  },
  {
    id: 'alert-2',
    tenantId: 'tenant-1',
    type: 'info',
    title: 'Novo agente ativado',
    message: 'O agente "Suporte Técnico" foi ativado com sucesso.',
    timestamp: new Date(Date.now() - 86400000),
    read: true,
  },
  {
    id: 'alert-3',
    tenantId: 'tenant-1',
    type: 'critical',
    title: 'Limite de STT próximo',
    message: 'Você atingiu 85% do limite de minutos de STT.',
    timestamp: new Date(Date.now() - 7200000),
    read: false,
  },
];

// KPI Data
export const mockKPIs = {
  activeConversations: 82,
  conversationsToday: 347,
  avgResponseTime: '1.2s',
  satisfactionRate: 94.5,
  consumptionPercentage: 57,
  activeAlerts: 2,
};
