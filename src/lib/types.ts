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

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profileId?: string | null;
  profileName?: string | null;
  permissions?: string[];
  tenantId: string | null; // Changed to nullable for pending users
  avatar?: string;
  isActive?: boolean; // Legacy, map to status

  // New Auth Fields (DB Agnostic)
  provider_id?: string;
  provider?: string;
  status: 'active' | 'pending' | 'blocked' | 'invited';
  owner_id?: string;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  systemKey?: string | null;
  tenantId: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  usersCount?: number;
}

export interface PlanDetails {
  // Define properties for PlanDetails if needed, otherwise it will be an empty interface
  // For now, assuming it might be similar to TenantPlan or PlanCatalog
  id: string;
  name: string;
  type: 'fixed' | 'flex' | 'unlimited';
  // ... other plan details
}

export interface ISOStatus {
  // Define properties for ISOStatus if needed, otherwise it will be an empty interface
  // For now, assuming it might be similar to TenantISOStatus
  tenantId: string;
  aiSystemOwnerId?: string;
  // ... other ISO status details
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'trial' | 'inactive' | 'suspended';
  planId: string;
  planName?: string; // Display name
  planDetails?: TenantPlan;
  planPrices?: {
    basePrice: number;
    llmTokenPrice: number;
    sttMinutePrice: number;
    ttsMinutePrice: number;
    messagePrice: number;
    whatsappOfficialBillingMode?: 'per_message' | 'window_24h';
    whatsappWindowPrice?: number;
    whatsappOfficialProviders?: ('meta' | 'zenvia')[];
  };
  isoStatus?: ISOStatus;
  roi_config?: {
    avg_human_minutes_per_interaction: number;
    operator_hourly_rate: number;
  };

  // ISO Management (Accountability)
  ai_system_owner_id?: string;
  risk_owner_id?: string;
  compliance_officer_id?: string;

  // Settings / Privacy
  settings?: {
    aiNoticeMessage?: string;
    retentionDays?: number;
    anonymizationEnabled?: boolean;
    session_timeout?: number;
  };
  brand_color?: string;
  logo_url?: string;

  limits: {
    llmTokens: number;
    messages: number;
    sttMinutes: number;
    ttsMinutes: number;
    agents: number;
    users: number;
  };
}

export interface BillingAlert {
  id: string;
  tenantId: string;
  threshold: number; // e.g., 50, 75, 90 percent of budget
  type: 'budget_exceeded' | 'usage_threshold';
  status: 'active' | 'triggered' | 'resolved';
  lastTriggeredAt?: Date;
  createdAt: Date;
  message?: string;
}

// ============ ISO 42001: AI Management System Types ============
export interface AIResponsibles {
  systemOwnerId: string; // The executive accountable for AI use
  riskOwnerId: string;   // Person responsible for risk management
  complianceOfficerId: string; // Person ensuring reg. adherence
}

export type AILifecycleStage = 'development' | 'validation' | 'production' | 'monitoring' | 'retired' | 'poc_demo';

export interface AIRiskAssessment {
  lastAssessmentDate: Date;
  nextReviewDate: Date;
  methodology: 'ISO_23894_B' | 'NIST_AI_RMF';
  riskScore: number; // 0-100
  residualRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  mitigationStatus: 'planned' | 'implemented' | 'verified';
}

// ============ Tenant/Plan Models (Functional Contract) ============

// ============ Usage & Plan Types ============
export interface UsageSummary {
  total_tokens: number;
  stt_minutes: number;
  tts_minutes: number;
  total_messages: number;
  active_agents: number;
}

export interface PlanCatalog {
  id: string;
  name: string;
  type: 'fixed' | 'flex' | 'unlimited';
  description?: string;

  // Pricing Strategy (Values for Expense Monitoring)
  basePrice: number; // Monthly subscription
  monthlyFeeCoversUsage?: boolean; // New Flag: If true, basePrice is credit. If false, it's just access fee.
  llmTokenPrice: number; // Price per 1k tokens
  messagePrice: number; // Price per message
  sttMinutePrice: number; // Price per STT minute
  ttsMinutePrice: number; // Price per TTS minute
  whatsappOfficialBillingMode?: 'per_message' | 'window_24h';
  whatsappWindowPrice?: number;
  whatsappOfficialProviders?: ('meta' | 'zenvia')[];

  // Default Provisioning Limits
  defaultLimits: {
    llmTokens: number;
    messages: number;
    sttMinutes: number;
    ttsMinutes: number;
    agents: number;
    users: number;
  };
}

export interface TenantPlan {
  tenantId: string;
  planId: string;
  type: 'fixed' | 'flex' | 'unlimited';
  allocation_mode?: 'flexible' | 'custom'; // New field for Smart Usage Allocation
  monthly_limit_brl?: number; // Added for consumption budget
  monthlyFeeCoversUsage?: boolean; // Inherited from PlanCatalog or Overridden

  // Current Contract Values (Can override catalog)
  customBasePrice?: number;
  customUnitPrices?: {
    llmTokenPrice?: number;
    messagePrice?: number;
    sttMinutePrice?: number;
    ttsMinutePrice?: number;
  };

  hardLimits?: {
    llmTokens: number;
    messages: number;
    sttMinutes: number;
    ttsMinutes: number;
    agents: number;
    users: number;
  };
  softLimits?: {
    monthlyBudget: number;
    alertThresholds: number[]; // e.g., [50, 75, 90]
  };
  overagePolicy: 'block' | 'notify' | 'allow_with_alert';
}

export interface TenantPrivacySettings {
  tenantId: string;
  aiDisclosureMessage: string;
  anonymizationEnabled: boolean;
  lgpdMaskingEnabled: boolean; // Added for UI masking
  retentionDays: number;
}

export interface TenantISOStatus {
  tenantId: string;
  aiSystemOwnerId?: string;
  riskOwnerId?: string;
  complianceResponsibleId?: string;
  lifecyclePolicyDefined: boolean;
  riskMethodologyDefined: boolean;
  lastAuditAt?: Date;
}

export interface Company {
  id: string;
  name: string;
  slug: string; // Functional Identifier & Webhook Namespace
  status: 'active' | 'suspended' | 'trial';
  planId: string;
  createdAt: Date;
  api_key?: string; // Security for external access

  // ISO Management (Accountability)
  ai_system_owner_id?: string;
  risk_owner_id?: string;
  compliance_officer_id?: string;

  aiResponsibles?: AIResponsibles; // ISO 42001 requirement

  // Contracts
  planDetails?: TenantPlan;
  privacySettings: TenantPrivacySettings;
  isoStatus?: TenantISOStatus;
  
  brand_color?: string;
  logo_url?: string;

  // Legacy compatibility (will be derived from planDetails)
  plan: 'free' | 'pro' | 'enterprise' | string; // Deprecated in favor of planId
  planName?: string;
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
  planPrices?: {
    basePrice: number;
    llmTokenPrice: number;
    messagePrice: number;
    sttMinutePrice: number;
    ttsMinutePrice: number;
    whatsappOfficialBillingMode?: 'per_message' | 'window_24h';
    whatsappWindowPrice?: number;
    whatsappOfficialProviders?: ('meta' | 'zenvia')[];
  };
  _count?: {
    agents: number;
    users: number;
    tokens: number;
    messages: number;
  };
}

export interface CompanyDavosCost {
  id: string;
  tenantId: string;
  itemKey: string;
  itemLabel: string;
  costValue: number;
  isRecurring: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeItem {
  id: string;
  tenantId: string;
  agentId: string;
  name: string;
  content?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  embedding?: number[]; // Vector embeddings for RAG
  createdAt: Date;
}

export interface FinancialReportRecord {
  tenantId: string;
  companyName: string;
  planName: string;
  revenueFixed: number;
  revenueVariable: number;
  costFixed: number;
  costVariableLlm: number;
  costVariableVoice: number;
  costVariableOther: number;
  netMargin: number;
}

export interface AgentBrainConfig {
  systemPrompt?: string;
  userPromptTemplate?: string;
  greetingMessage?: string;
  modelId?: string; // 'gpt-4' | 'claude-3-opus'
  temperature?: number;
  maxTokens?: number; // Added based on recent conv history
  knowledgeBaseId?: string;
  budget_share_pct?: number; // Smart Usage Allocation

  // Identity & Transactional Framework
  capabilities?: {
    conversation_mode?: 'open' | 'transactional';
    identity_gate?: {
      enabled?: boolean;
      protected_intents?: string[];
      gatekeeper_system_prompt?: string;
      validation_success_message?: string;
      validation_method?: 'formula' | 'api';
      api_url?: string;
    };
  };

  // Tools & Actions
  tools?: {
    name: string;
    description: string;
    webhook_url: string;
  }[];
}

// ============ Security & Identity Types ============
export type SecuritySessionStatus = 'unauthenticated' | 'active' | 'locked' | 'expired';

export interface ConversationSecuritySession {
  id: string;
  conversation_id: string;
  agent_id: string;
  status: SecuritySessionStatus;
  validated_identifier?: string;
  failed_attempts: number;
  locked_until?: Date;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AgentVoiceConfig {
  provider: 'retell' | 'vapi' | 'none';
  retellAgentId?: string;
  vapiAgentId?: string; // Added for Vapi integration
  voiceId?: string;
  ambientSound?: 'coffee-shop' | 'office' | 'clean';
}

export interface Agent {
  id: string;
  name: string;
  last_actor_name?: string; // New field for audit tracking
  tenantId?: string; // Optional in UI creation
  tenantSlug?: string; // Functional Identifier (ReadOnly in UI)
  status: 'active' | 'inactive';
  channels: ('text' | 'voice')[];
  department_id?: string;
  cost_center?: string;
  totalConversations: number;
  activeConversations: number;
  maxConcurrentConversations: number;

  // Governance & Risk (ISO 42001)
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number; // 0-100 Calculated based on Performance & Incidents
  policies: string[]; // Policy Names

  // Functional Behavior
  lifecycleStage: AILifecycleStage; // IMPACTS: Sandbox restriction, dispatch rules
  autonomyLevel: 1 | 2 | 3 | 4 | 5; // IMPACTS: Human fallback, tool usage
  contextWindow: number; // For n8n RAG/Memory parametrization
  sessionTimeoutSeconds?: number;

  riskAssessment?: AIRiskAssessment;
  role?: string; // For UI display

  // Integration (Functional Contract)
  brainConfig?: AgentBrainConfig;
  voiceConfig?: AgentVoiceConfig;

  // New Integration Fields
  type?: 'embedded' | 'whatsapp' | 'conversational';
  parent_agent_id?: string; // New field for sub-agents
  whatsapp_provider?: 'evolution' | 'meta' | 'zenvia'; // Provider: Evolution (unofficial), Meta Direct, Zenvia BSP (oficial Meta)
  meta_api_token?: string; // New field for Official Meta API
  meta_phone_id?: string; // New field for Meta Phone Number ID
  meta_waba_id?: string; // New field for Meta WhatsApp Business Account ID
  meta_verify_token?: string; // New field for Meta Webhook Verification
  evolution_instance?: string; // Evolution API instance name for dynamic lookup
  evolution_token?: string;
  zenvia_channel_id?: string;  // Número Zenvia associado ao agente ("from" nos payloads)
  zenvia_api_token?: string;   // API Token Zenvia (armazenado criptografado)
  knowledgeItems?: KnowledgeItem[]; // Phase 2: Knowledge Base
  integrationConfig?: {
    n8n_webhook_url?: string;
    response_mode?: 'match_input' | 'text_only' | 'audio_only';
  };

  // Usage Metrics (Aggregated)
  usage?: {
    totalTokens: number;
    totalCost: number;
    totalMessages?: number;
    totalStt?: number;
    totalTts?: number;
  };

  // Legacy Integration (To be deprecated/migrated to voiceConfig)
  integration?: {
    n8n_webhook_url: string; // READ-ONLY: Generated based on slug/id
    n8n_workflow_id?: string;
    voice_provider: 'retell' | null;
  };

  // Real DB Governance fields
  applied_policies?: string[];

  // Dynamic Gatekeeper & Security (V7)
  is_gatekeeper?: boolean;
  gatekeeper_scope?: 'specific' | 'tenant';
  requires_security?: boolean;
  gatekeeper_config?: any;
  workflow_blueprint?: {
    initial_step: string;
    steps: Record<string, {
      rules: string;
      allowed_next: string[];
    }>;
  };
}

export interface AgentTool {
  id: string;
  tenant_id: string;
  agent_id?: string;
  name: string;
  description: string;
  parameters_schema: any;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
  body_mapping?: Record<string, any>;
  response_mode: 'json' | 'text';
  output_schema?: any;
  is_active: boolean;
  category: 'query' | 'action' | 'access_key'; // Dynamic Gatekeeper V7
  created_at: Date;
  updated_at: Date;
}

// ============ AI Governance Types ============
export interface AgentGovernance {
  agentId: string;
  riskLevel: 'low' | 'medium' | 'high';
  usageType: 'informational' | 'operational' | 'sensitive';
  autonomyLevel: number; // 1-5
  policies: string[];
  // ISO 42001 & 23894 Extensions
  lifecycleStage: AILifecycleStage;
  riskAssessment?: AIRiskAssessment;
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

export interface IncidentAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: Date;
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
  resolvedBy?: string;
  resolverName?: string;
  status: 'open' | 'investigating' | 'resolved';
  actionTaken?: string;
  reportedBy: string;
  attachments: IncidentAttachment[];
  agentName?: string;
  userName?: string;
  userIdentifier?: string;
}

// ============ Conversational Flow Types ============
export type FlowStageType = 'greeting' | 'qualification' | 'resolution' | 'handoff' | 'closing';

export interface FlowStage {
  id: string;
  order: number;
  name: string;
  type: FlowStageType;
  description: string;
  expected_outcome: string;
  escalation_allowed: boolean;
  escalation_rule?: string; // Rule for N8N to interpret
  actor_type: 'ai' | 'human' | 'both';
}

export interface ConversationalFlow {
  id: string;
  tenant_id: string;
  tenantSlug: string;
  name: string;
  description: string;
  type: 'inbound' | 'outbound';
  objective: string;
  success_criteria: string;
  stages: FlowStage[];
  linked_agents: string[]; // IDs of agents using this flow
  status: 'active' | 'inactive';
  createdAt: Date;
}

// ============ Metrics & Consumption Types ============

/**
 * Unified Consumption Contract (Front-end as Contract)
 * This interface represents the source of truth for all consumption data.
 * Every record is traceable to a specific tenant, agent, and channel.
 */
export type MetricType = 'tokens' | 'messages' | 'stt_minutes' | 'tts_minutes' | 'whatsapp_window_24h';
export type ConsumptionChannel = 'text' | 'voice' | 'whatsapp';

export interface ConsumptionMetrics {
  id: string;
  tenantId: string;
  tenantSlug: string;
  agentId?: string; // Optional (e.g., system-level tasks)
  channel: ConsumptionChannel;
  metricType: MetricType;
  value: number;
  unit: string; // "tokens", "units", "minutes"
  cost: number; // In local currency (e.g., BRL)
  timestamp: Date;
  metadata?: {
    model?: string; // e.g., "gpt-4o"
    provider?: string; // e.g., "openai", "retell", "elevenlabs"
    externalEventId?: string; // Link to N8N/Webhook event
  };
}

/**
 * Matrix for Heatmap / Peak Usage analysis
 * Intensities are derived from message/call volume.
 */
export interface PeakUsageMatrix {
  dayOfWeek: number; // 0-6 (Sun-Sat)
  hourOfDay: number; // 0-23
  intensity: number; // 0-1 (Calculated: volume / maxVolume)
  eventCount: number;
}

export interface ConsumptionSummary {
  tenantId: string;
  period: string; // ISO Month or YYYY-MM-DD range
  totalCost: number;
  breakdown: {
    llm: { cost: number; value: number; unit: string };
    stt: { cost: number; value: number; unit: string };
    tts: { cost: number; value: number; unit: string };
  };
  limits: {
    llmTokens: number;
    messages: number;
    sttMinutes: number;
    ttsMinutes: number;
  };
}

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

// ============ Conversation & Message Types ============
export interface Message {
  id: string;
  conversationId: string;
  tenantId: string;
  tenantSlug: string;
  content: string;
  type: 'text' | 'audio' | 'image';
  sender: 'user' | 'ai' | 'human';
  senderName?: string;
  timestamp: Date;
  audioUrl?: string; // Phase 3: Audio Player Support
  imageUrl?: string;
  transcription?: string;
  isSimulation?: boolean; // Phase 2: Playground Logic
}

export interface Conversation {
  id: string;
  tenantId: string;
  tenantSlug: string;
  agentId: string;
  userId: string;
  userName: string;
  establishmentName?: string;
  userStatus?: string;
  userAvatar?: string;
  agentName?: string;
  agentType?: 'embedded' | 'whatsapp' | 'conversational';
  channel: 'text' | 'voice' | 'whatsapp';
  status: 'ai_active' | 'human_active' | 'closed';
  assignedOperator?: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
  messageCount?: number; // Real total from DB — messages[] is paginated (max 50)
  sentiment?: string | null;   // Filled by AI agent: 'interessado' | 'neutro' | 'resistente' | null
  createdAt: Date;
  isSimulation?: boolean; // Phase 2: Playground
  active_agent_id?: string; // ID of the currently active agent (Parent or Gatekeeper)
  voiceStatus?: 'listening' | 'processing' | 'speaking' | 'idle'; // Phase 3: Realtime Status
  complianceScore?: number;
  evaluation?: Evaluation;
}

export interface ExtendedConversation extends Conversation {
  origin: 'inbound' | 'outbound';
  flowId?: string;
  decisionLogs: AIDecisionLog[];
}

export interface Contact {
  id: string;
  tenantId: string;
  name: string;
  identifier: string; // Phone or Email
  email?: string;
  phone?: string; // Explicit phone field
  avatarUrl?: string;
  tags?: string[];
  channel?: 'embedded' | 'whatsapp' | 'conversational' | 'voice' | 'text';
  extraInfo?: Record<string, any>; // JSONB
  lifecycleStatus?: string;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
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

// ============ LGPD & Privacy Types (Brazil) ============
export interface LGPDSettings {
  controllerId: string; // Tenant ID
  dpoUserId: string;
  dataRetentionMonths: number;
  privacyNoticeVersion: string;
}

export type DataClassification = 'public' | 'internal' | 'personal' | 'sensitive';
export type DataSubjectRight = 'access' | 'anonymization' | 'deletion' | 'portability';

export interface DSARRequest {
  id: string;
  tenantId: string;
  subjectId: string; // User/Customer ID
  requestType: DataSubjectRight;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestDate: Date;
  completionDate?: Date;
  evidenceRef?: string; // Link to audit log
}

// ============ SLA & Operations Types ============
export interface SLAConfiguration {
  id: string;
  tenantId: string;
  channel: 'whatsapp' | 'voice' | 'web';
  firstResponseTimeSeconds: number; // Target
  resolutionTimeMinutes: number; // Target
  maxHumanFallbackRate: number; // Percentage
  operatingHours: '24x7' | 'business_hours';
}

export interface OperationalMetrics {
  currentQueueSize: number;
  avgResponseTimeSeconds: number;
  slaBreachCount: number;
  humanFallbackRate: number;
  activeChannels: number;
}

// ============ Enterprise Audit Types ============
export type AuditActionType =
  | 'auth.login' | 'auth.logout' | 'auth.impersonate'
  | 'agent.create' | 'agent.update' | 'agent.delete'
  | 'policy.update' | 'flow.update'
  | 'data.export' | 'data.anonymize'
  | 'conversation.transfer';

export interface AuditLog {
  id: string;
  timestamp: Date;
  tenantId: string;
  tenantSlug?: string;
  actorId: string; // User ID or System
  actorName: string;
  action: AuditActionType | string;
  targetType: string; // e.g., 'tenant', 'agent', 'policy'
  targetId?: string; // ID of object affected
  before?: any; // State before the action
  after?: any;  // State after the action
  details: string; // Description 
  ipAddress?: string;
  userAgent?: string;
}

// ============ Integration Events (N8N / Voice) ============
export type ChannelEventType =
  // Message Events
  | 'message.received' | 'message.sent' | 'message.delivered' | 'message.read'
  // Conversation Lifecycle
  | 'conversation.started' | 'conversation.closed' | 'channel.unavailable'
  // Voice (N8N Hub / Retell)
  | 'voice.call.started' | 'voice.call.ended' | 'voice.transcript.generated' | 'escalation.triggered';

export interface ChannelEvent {
  id: string;
  eventId: string; // Internal system event ID
  externalId?: string; // e.g., retell_call_id, whatsapp_sid
  eventType: ChannelEventType;
  timestamp: Date;
  tenantId: string;
  tenantSlug: string;
  metadata: Record<string, any>;
  rawPayload?: any;
}

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

// ============ Quality Assurance (Auditor) Types ============
export interface EvaluationCriteria {
  empathy: number;
  efficiency: number;
  compliance: number;
}

export interface Evaluation {
  id: string;
  tenantId: string;
  conversationId: string;
  agentId: string;
  score: number;
  summary: string;
  tags: string[];
  criteriaResults: EvaluationCriteria;
  aiModel?: string;
  createdAt: Date;

  // Joins (Optional)
  agentName?: string;
  conversationDate?: Date;
}
export interface BillingAlert {
  id: string;
  tenantId: string;
  metricType: 'tokens' | 'messages' | 'cost';
  thresholdPercent: number;
  isActive: boolean;
  lastTriggeredAt?: Date;
}

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Campaign {
  id: string;
  tenantId: string;
  agentId: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  startDate: Date;
  endDate?: Date;
  startTime?: string;
  endTime?: string;
  initialMessage?: string;
  dailyLimit: number;
  totalContacts: number;
  sentCount: number;
  deliveredCount?: number;
  responseCount: number;
  totalMessages: number;
  conversionCount: number;
  conversionRate?: number;
  failedCount?: number;
  importErrorCount?: number;
  successCriteria?: string[];
  successLinkFilter?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignImportLog {
  id: string;
  campaignId: string;
  tenantId: string;
  rowNumber: number;
  contactName?: string;
  contactPhone?: string;
  errorType: 'INVALID_PHONE' | 'DUPLICATE' | 'MISSING_NAME' | 'OTHER';
  errorMessage?: string;
  rawData?: Record<string, any>;
  createdAt: Date;
}

export interface OutboundContact {
  id: string;
  tenantId: string;
  agentId: string;
  campaignId?: string; // Linked to a strategic campaign
  contactName?: string;
  contactPhone: string;
  metadata?: Record<string, any>;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  errorMessage?: string;
  retryCount: number;
  responseDetected: boolean;
  scheduledAt: Date;
  lastAttemptAt?: Date;
  sentAt?: Date;
  createdAt: Date;
}

export interface AgentLead {
  id: string;
  tenantId: string;
  campaignId?: string | null;
  identifier: string;
  identifierType?: string | null;
  name?: string | null;
  whatsapp?: string | null;
  ctaLink?: string | null;
  status?: string | null;
  metadata?: Record<string, any>;
  createdAt?: Date;
}
