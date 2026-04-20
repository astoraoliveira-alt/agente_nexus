-- Davos Nexus - Complete Database Schema (Consolidated)
-- Generated: 2026-02-27
-- 
-- 🔴 CRITICAL: This file is the SINGLE SOURCE OF TRUTH for the database structure.
-- It combines the base schema with all modules (Plans, Evaluations, Knowledge Base, Audit, Campaigns V2, Memory).

-- =============================================
-- BRAZIL STANDARD CONFIGURATION
-- =============================================
SET TIMEZONE TO 'America/Sao_Paulo';
SET DATESTYLE TO 'Postgres, DMY'; 

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector"; -- Required for embeddings

-- =============================================
-- RLS HELPERS (To avoid recursion)
-- =============================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id FROM public.users 
    WHERE id = auth.uid() 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- ENUMS
-- =============================================
DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'trial');
    CREATE TYPE plan_type AS ENUM ('fixed', 'flex', 'unlimited', 'enterprise');
    CREATE TYPE agent_status AS ENUM ('active', 'inactive');
    CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
    CREATE TYPE lifecycle_stage AS ENUM ('development', 'validation', 'production', 'monitoring', 'retired');
    CREATE TYPE conversation_channel AS ENUM ('text', 'voice', 'whatsapp');
    CREATE TYPE conversation_status AS ENUM ('ai_active', 'human_active', 'closed');
    CREATE TYPE flow_direction AS ENUM ('inbound', 'outbound');
    CREATE TYPE flow_actor AS ENUM ('ai', 'human', 'both');
    CREATE TYPE metric_type AS ENUM ('tokens', 'messages', 'stt_minutes', 'tts_minutes');
    CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
    CREATE TYPE incident_status AS ENUM ('open', 'investigating', 'resolved');
    CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- 1. COMPANIES & PLANS
-- =============================================

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE, 
    status tenant_status DEFAULT 'trial',
    plan_tier TEXT DEFAULT 'fixed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ISO Management
    ai_system_owner_id UUID,
    risk_owner_id UUID,
    compliance_officer_id UUID,

    -- Security
    api_key VARCHAR(1024), 

    -- Configuration
    plan_details JSONB DEFAULT '{}'::jsonb, 
    privacy_settings JSONB DEFAULT '{"anonymization": false, "retention_days": 365}'::jsonb,
    roi_config JSONB DEFAULT '{"operator_hourly_rate": 30.0, "avg_human_minutes_per_interaction": 2.5}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin Delete Companies" ON companies;
CREATE POLICY "Super Admin Delete Companies" ON companies FOR DELETE USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

DROP POLICY IF EXISTS "Super Admin Insert Companies" ON companies;
CREATE POLICY "Super Admin Insert Companies" ON companies FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies 
FOR SELECT USING (
    id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

DROP POLICY IF EXISTS "Tenant Update Own Company" ON companies;
CREATE POLICY "Tenant Update Own Company" ON companies 
FOR UPDATE USING (
    id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

-- PLANS TABLE (Added Module)
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('fixed', 'flex', 'unlimited', 'enterprise')),
    description TEXT,
    base_price NUMERIC DEFAULT 0,
    llm_token_price NUMERIC DEFAULT 0,
    message_price NUMERIC DEFAULT 0,
    stt_minute_price NUMERIC DEFAULT 0,
    tts_minute_price NUMERIC DEFAULT 0,
    default_limits JSONB DEFAULT '{}'::JSONB,
    monthly_fee_covers_usage BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plans RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "everyone_read_plans" ON plans;
CREATE POLICY "everyone_read_plans" ON plans FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_modify_plans" ON plans;
CREATE POLICY "admin_modify_plans" ON plans FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin')) WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

-- DAVOS COSTS TABLE (Added Module)
CREATE TABLE IF NOT EXISTS company_davos_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_key VARCHAR(50) NOT NULL, 
    item_label VARCHAR(255) NOT NULL, 
    cost_value NUMERIC(10, 4) NOT NULL DEFAULT 0,
    is_recurring BOOLEAN DEFAULT TRUE, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_davos_costs_tenant ON company_davos_costs(tenant_id);

ALTER TABLE company_davos_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin Access Davos Costs" ON company_davos_costs;
CREATE POLICY "Super Admin Access Davos Costs" ON company_davos_costs FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

-- BILLING ALERTS (Added Module)
CREATE TABLE IF NOT EXISTS billing_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES companies(id) ON DELETE CASCADE, 
    metric_type TEXT NOT NULL, 
    threshold_percent DECIMAL NOT NULL, 
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE billing_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Billing Alerts" ON billing_alerts;
CREATE POLICY "Tenant Access Billing Alerts" ON billing_alerts FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- =============================================
-- 2. USERS & RBAC
-- =============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES companies(id), 
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(1024),
    role VARCHAR(50) DEFAULT 'viewer', 
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Auth V2 additions (Decoupled Authentication)
    provider_id VARCHAR(255),
    provider VARCHAR(50) DEFAULT 'supabase',
    status VARCHAR(50) DEFAULT 'pending',
    owner_id UUID REFERENCES users(id),

    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users 
FOR SELECT USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

DROP POLICY IF EXISTS "Users Register Self" ON users;
CREATE POLICY "Users Register Self" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- 3. AGENTS & INTELLIGENCE
-- =============================================

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    status agent_status DEFAULT 'active',
    
    -- Capacity & Usage
    active_conversations INT DEFAULT 0,
    total_conversations INT DEFAULT 0,
    max_concurrency INT DEFAULT 50,

    -- Risk & Governance
    risk_level risk_level DEFAULT 'low',
    risk_score INT DEFAULT 0, 
    lifecycle_stage lifecycle_stage DEFAULT 'development',
    autonomy_level INT DEFAULT 1 CHECK (autonomy_level BETWEEN 1 AND 5),

    -- Configuration
    brain_config JSONB NOT NULL DEFAULT '{}'::jsonb, 
    voice_config JSONB DEFAULT '{}'::jsonb,
    integration_config JSONB DEFAULT '{}'::jsonb,
    context_window INT DEFAULT 10,
    session_timeout_seconds INT DEFAULT 3600,

    -- Integration (Evolution & Meta)
    evolution_instance VARCHAR(255),
    evolution_token TEXT,
    whatsapp_api_type VARCHAR(50) DEFAULT 'evolution' CHECK (whatsapp_api_type IN ('evolution', 'meta_official')),
    meta_api_token TEXT,

    -- Agent Type
    type VARCHAR(50) DEFAULT 'conversational' CHECK (type IN ('embedded', 'whatsapp', 'conversational')),

    channels TEXT[], 
    applied_policies TEXT[], 
    
    -- Control & Cost Track
    last_actor_name TEXT,
    department_id TEXT,
    cost_center TEXT,

    role VARCHAR(255), -- Agente role display
    parent_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE, -- 1-level hierarchy

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents 
FOR ALL USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

-- =============================================
-- AGENT HIERARCHY LOGIC
-- =============================================

-- Sync status from Parent to Child
CREATE OR REPLACE FUNCTION sync_child_agent_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If status is updated, propagate to children
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE agents 
        SET status = NEW.status
        WHERE parent_agent_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_child_status
AFTER UPDATE OF status ON agents
FOR EACH ROW
WHEN (NEW.parent_agent_id IS NULL) -- Only propagate from top-level agents to sub-agents
EXECUTE FUNCTION sync_child_agent_status();

-- Enforce 1 level depth
CREATE OR REPLACE FUNCTION enforce_agent_hierarchy_depth()
RETURNS TRIGGER AS $$
DECLARE
    parent_has_parent BOOLEAN;
BEGIN
    IF NEW.parent_agent_id IS NOT NULL THEN
        -- Standardize self-parent check
        IF NEW.id = NEW.parent_agent_id THEN
            RAISE EXCEPTION 'An agent cannot be its own parent.';
        END IF;

        SELECT (parent_agent_id IS NOT NULL) INTO parent_has_parent
        FROM agents 
        WHERE id = NEW.parent_agent_id;
        
        IF parent_has_parent THEN
            RAISE EXCEPTION 'Davos Nexus supports only 1 level of agent hierarchy (Parent -> Child). Multi-level nesting is forbidden.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_agent_hierarchy_depth
BEFORE INSERT OR UPDATE OF parent_agent_id ON agents
FOR EACH ROW
EXECUTE FUNCTION enforce_agent_hierarchy_depth();

-- AGENT KNOWLEDGE BASE (RAG)
CREATE TABLE IF NOT EXISTS agent_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT, 
    file_url VARCHAR(1024), 
    file_type VARCHAR(50), 
    file_size INTEGER, 
    embedding vector(1536), -- Dimension setup for OpenAI `text-embedding-3-small`
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_tenant ON agent_knowledge(tenant_id);

DROP POLICY IF EXISTS "Tenant Manage Knowledge" ON agent_knowledge;
CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge 
FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

-- AGENT SUCCESS MEMORY (Positive Reinforcement RAG)
CREATE TABLE IF NOT EXISTS agent_success_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES companies(id),
    original_conversation_id UUID,
    user_intent VARCHAR(255),
    strategic_summary TEXT NOT NULL,
    full_dialogue_snippet TEXT,
    score INT,
    tags TEXT[] DEFAULT '{}'::text[],
    embedding vector(1536),
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_success_memory_agent ON agent_success_memory(agent_id);
ALTER TABLE agent_success_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Access Success Memory" ON agent_success_memory;
CREATE POLICY "Tenant Access Success Memory" ON agent_success_memory FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- =============================================
-- 4. GOVERNANCE & LOGS
-- =============================================

CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    rules JSONB NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Policies" ON policies;
CREATE POLICY "Tenant Access Policies" ON policies FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID REFERENCES agents(id),
    conversation_id UUID,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity incident_severity DEFAULT 'medium',
    status incident_status DEFAULT 'open',
    reported_by UUID REFERENCES users(id),
    
    -- Resolution Control
    resolved_by UUID REFERENCES users(id),
    action_taken TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Incidents" ON incidents;
CREATE POLICY "Tenant Read Incidents" ON incidents 
FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

-- =============================================
-- 5. CONVERSATIONAL FLOWS
-- =============================================

CREATE TABLE IF NOT EXISTS flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    direction flow_direction DEFAULT 'inbound',
    objective TEXT NOT NULL,
    success_criteria TEXT,
    status agent_status DEFAULT 'active',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Flows" ON flows;
CREATE POLICY "Public Read Flows" ON flows FOR SELECT USING (true); -- Public for webhooks often, can be restricted

DROP POLICY IF EXISTS "Tenant Insert Flows" ON flows;
CREATE POLICY "Tenant Insert Flows" ON flows FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant Update Flows" ON flows;
CREATE POLICY "Tenant Update Flows" ON flows FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS flow_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, 
    description TEXT,
    expected_outcome TEXT,
    actor flow_actor DEFAULT 'ai',
    escalation_rule VARCHAR(255) 
);

ALTER TABLE flow_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Flow Stages" ON flow_stages;
CREATE POLICY "Tenant Access Flow Stages" ON flow_stages FOR ALL USING (flow_id IN (SELECT id FROM flows WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())));

CREATE INDEX IF NOT EXISTS idx_flow_stages_flow ON flow_stages(flow_id);

CREATE TABLE IF NOT EXISTS agent_flows (
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    flow_id UUID REFERENCES flows(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (agent_id, flow_id)
);

ALTER TABLE agent_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Agent Flows" ON agent_flows;
CREATE POLICY "Tenant Access Agent Flows" ON agent_flows FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())));

-- =============================================
-- 6. CONTACTS & CAMPAIGNS (CRM)
-- =============================================

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255),
    identifier VARCHAR(255), 
    email VARCHAR(255),
    phone VARCHAR(255),
    avatar_url TEXT,
    
    tags TEXT[] DEFAULT '{}',
    channel VARCHAR(50), 
    lifecycle_status VARCHAR(50) DEFAULT 'lead',
    sentiment VARCHAR(50),
    
    extra_info JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_identifier ON contacts(identifier);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Manage Contacts" ON contacts;
CREATE POLICY "Tenant Manage Contacts" ON contacts 
FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status campaign_status DEFAULT 'draft',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    start_time TEXT DEFAULT '09:00',
    end_time TEXT DEFAULT '18:00',
    daily_limit INTEGER DEFAULT 50,
    initial_message TEXT,
    
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    response_count INTEGER DEFAULT 0,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);

CREATE TABLE IF NOT EXISTS outbound_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(255) NOT NULL,
    
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    response_detected BOOLEAN DEFAULT false,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- UNIQUE constraint for intelligent idempotency per campaign
    UNIQUE(campaign_id, contact_phone)
);

ALTER TABLE outbound_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_outbound_queue_tenant ON outbound_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_campaign ON outbound_queue(campaign_id);
-- Fast querying for the n8n workers processing pending messages
CREATE INDEX IF NOT EXISTS idx_outbound_queue_status_retry ON outbound_queue(status, retry_count) WHERE status = 'pending';

-- =============================================
-- 7. CONVERSATIONS & MESSAGES
-- =============================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID REFERENCES agents(id),
    user_identifier VARCHAR(255), 
    user_name VARCHAR(255),
    
    channel conversation_channel NOT NULL,
    status conversation_status DEFAULT 'ai_active',
    
    assigned_operator_id UUID REFERENCES users(id),
    
    current_flow_id UUID REFERENCES flows(id),
    current_stage_id UUID REFERENCES flow_stages(id),
    
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    voice_status VARCHAR(50), 
    is_simulation BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    duration_seconds INTEGER DEFAULT 0,
    sentiment VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations 
FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES companies(id),
    
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text', 
    sender_type VARCHAR(20) NOT NULL, 
    sender_name VARCHAR(255),
    
    audio_url TEXT,
    transcription TEXT,
    image_url TEXT,
    
    -- VAPI Integ & Metadata
    external_id VARCHAR(255),
    external_order INT,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS uq_messages_tenant_external_id;
ALTER TABLE messages ADD CONSTRAINT uq_messages_tenant_external_id UNIQUE (tenant_id, external_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- =============================================
-- 8. AGENT RESPONSES QUEUE (Idempotency & Reliability)
-- =============================================

CREATE TABLE IF NOT EXISTS public.agent_responses_queue (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  trace_id TEXT,
  tenant_id uuid NOT NULL REFERENCES companies(id),
  conversation_id uuid REFERENCES conversations(id),
  phone TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending'::TEXT,
  n8n_execution_id TEXT,
  created_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone,
  CONSTRAINT agent_responses_queue_pkey PRIMARY KEY (id),
  CONSTRAINT agent_responses_queue_trace_id_key UNIQUE (trace_id)
);

-- RLS for Responses Queue
ALTER TABLE agent_responses_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Manage Responses" ON agent_responses_queue;
CREATE POLICY "Tenant Manage Responses" ON agent_responses_queue 
FOR ALL USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

CREATE INDEX IF NOT EXISTS idx_agent_resp_tenant ON agent_responses_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_resp_trace ON agent_responses_queue(trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_resp_status ON agent_responses_queue(status) WHERE status = 'pending';


ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages 
FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

CREATE TABLE IF NOT EXISTS conversation_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID, 
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    storage_path VARCHAR(255),
    external_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_artifacts_tenant ON conversation_artifacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conv_artifacts_conv ON conversation_artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_artifacts_agent ON conversation_artifacts(agent_id);

ALTER TABLE conversation_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Access Conversation Artifacts" ON conversation_artifacts 
FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- EVALUATIONS (QA/Auditoria)
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    
    score INT NOT NULL CHECK (score BETWEEN 0 AND 100), 
    
    summary TEXT, 
    tags TEXT[], 
    criteria_results JSONB DEFAULT '{}'::jsonb,
    
    ai_model VARCHAR(255), 
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_tenant ON evaluations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_conversation ON evaluations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_score ON evaluations(score);

ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Read Evaluations" ON evaluations;
CREATE POLICY "Tenant Read Evaluations" ON evaluations 
FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Tenant Insert Evaluations" ON evaluations;
CREATE POLICY "Tenant Insert Evaluations" ON evaluations 
FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

-- =============================================
-- 8. CONSUMPTION & METRICS
-- =============================================

CREATE TABLE IF NOT EXISTS consumption_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID REFERENCES agents(id), -- Nullable references agents
    
    channel conversation_channel NOT NULL,
    metric_type metric_type NOT NULL,
    value NUMERIC NOT NULL,
    cost NUMERIC(10, 4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'BRL',
    
    metadata JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    department_id TEXT,
    cost_center TEXT,
    trace_id VARCHAR(255),
    idempotency_key VARCHAR(255),
    unit VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_consumption_metrics_query ON public.consumption_metrics(tenant_id, metric_type, recorded_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_idempotency ON public.consumption_metrics(idempotency_key)
WHERE (idempotency_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_consumption_metrics_tenant_recorded ON public.consumption_metrics(tenant_id, recorded_at DESC);

ALTER TABLE consumption_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Consumption" ON consumption_metrics;
CREATE POLICY "Tenant Read Consumption" ON consumption_metrics 
FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

-- =============================================
-- 9. AUDIT & LOGS
-- =============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    actor_id UUID, 
    actor_name VARCHAR(255),
    
    action VARCHAR(255) NOT NULL,
    target_type VARCHAR(255) NOT NULL,
    target_id UUID,
    
    state_before JSONB,
    state_after JSONB,
    details TEXT,
    
    ip_address VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Audit Logs" ON audit_logs;
CREATE POLICY "Tenant Access Audit Logs" ON audit_logs 
FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

-- INTEGRATION LOGS
CREATE TABLE IF NOT EXISTS integration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES companies(id),
    provider VARCHAR(255) DEFAULT 'vapi',
    external_id VARCHAR(255), 
    payload JSONB NOT NULL,
    status VARCHAR(255) DEFAULT 'success', 
    error_details TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_provider_ext ON integration_logs(provider, external_id);

ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Integration Logs" ON integration_logs;
CREATE POLICY "Tenant Access Integration Logs" ON integration_logs 
FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);

ALTER TABLE integration_logs DROP CONSTRAINT IF EXISTS uq_integration_logs_provider_external_id;
ALTER TABLE integration_logs ADD CONSTRAINT uq_integration_logs_provider_external_id UNIQUE (provider, external_id); -- For Upsert logic

-- CHAT HISTORY MEMORY (LangChain/External)
CREATE TABLE IF NOT EXISTS chat_histories_memory (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    message JSONB NOT NULL
);

ALTER TABLE chat_histories_memory ENABLE ROW LEVEL SECURITY;

-- AGENT AUDIT LOGS
CREATE TABLE IF NOT EXISTS agent_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    actor_id UUID, 
    actor_name TEXT, 
    action VARCHAR(255) NOT NULL, 
    old_state JSONB,
    new_state JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Agent Logs" ON agent_audit_logs;
CREATE POLICY "Tenant Read Agent Logs" ON agent_audit_logs FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())));

-- PLAN AUDIT LOGS
CREATE TABLE IF NOT EXISTS plan_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    actor_id UUID, 
    actor_name TEXT,
    action VARCHAR(255) NOT NULL, 
    old_state JSONB,
    new_state JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE plan_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin Read Plan Logs" ON plan_audit_logs;
CREATE POLICY "Super Admin Read Plan Logs" ON plan_audit_logs FOR SELECT USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

-- =============================================
-- 10. FUNCTIONS & TRIGGERS
-- =============================================

-- Agent Audit Trigger
CREATE OR REPLACE FUNCTION audit_agent_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, action, old_state, new_state)
        VALUES (OLD.id, auth.uid(), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, action, old_state)
        VALUES (OLD.id, auth.uid(), 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, action, new_state)
        VALUES (NEW.id, auth.uid(), 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_agents ON agents;
CREATE TRIGGER trg_audit_agents AFTER INSERT OR UPDATE OR DELETE ON agents FOR EACH ROW EXECUTE FUNCTION audit_agent_changes();

-- Plan Audit Trigger
CREATE OR REPLACE FUNCTION audit_plan_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, action, old_state, new_state)
        VALUES (OLD.id, auth.uid(), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, action, old_state)
        VALUES (OLD.id, auth.uid(), 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, action, new_state)
        VALUES (NEW.id, auth.uid(), 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_plans ON plans;
CREATE TRIGGER trg_audit_plans AFTER INSERT OR UPDATE OR DELETE ON plans FOR EACH ROW EXECUTE FUNCTION audit_plan_changes();

-- Evaluation Functions (Legacy Interface)
CREATE OR REPLACE FUNCTION get_conversation_transcript(p_conversation_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_transcript TEXT := '';
    r RECORD;
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM conversations WHERE id = p_conversation_id) INTO v_exists;
    IF NOT v_exists THEN RETURN 'ERROR: Conversation ID ' || p_conversation_id || ' not found.'; END IF;

    FOR r IN SELECT created_at, sender_type, COALESCE(content, '[MEDIA/AUDIO]') as content FROM messages WHERE conversation_id = p_conversation_id ORDER BY created_at ASC
    LOOP
        v_transcript := v_transcript || '[' || to_char(r.created_at, 'DD/MM HH24:MI') || '] ' || UPPER(COALESCE(r.sender_type, 'UNKNOWN')) || ': ' || COALESCE(r.content, '') || E'\n';
    END LOOP;
    
    IF v_transcript = '' THEN RETURN 'WARNING: No messages found for this conversation.'; END IF;
    RETURN v_transcript;
END;
$$;

CREATE OR REPLACE FUNCTION save_evaluation(p_conversation_id UUID, p_score INT, p_summary TEXT, p_tags TEXT[], p_criteria JSONB, p_model VARCHAR DEFAULT 'n8n-auto')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tenant_id UUID;
    v_agent_id UUID;
    v_eval_id UUID;
BEGIN
    SELECT tenant_id, agent_id INTO v_tenant_id, v_agent_id FROM conversations WHERE id = p_conversation_id;
    IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;

    INSERT INTO evaluations (tenant_id, conversation_id, agent_id, score, summary, tags, criteria_results, ai_model) 
    VALUES (v_tenant_id, p_conversation_id, v_agent_id, p_score, p_summary, p_tags, p_criteria, p_model)
    RETURNING id INTO v_eval_id;
    
    IF p_score < 40 THEN
        INSERT INTO incidents (tenant_id, agent_id, conversation_id, title, description, severity, status) 
        VALUES (v_tenant_id, v_agent_id, p_conversation_id, 'Low Quality Interaction Detected (Score: ' || p_score || ')', 'Automated Audit Flag: ' || p_summary, 'medium', 'open');
    END IF;

    RETURN jsonb_build_object('success', true, 'evaluation_id', v_eval_id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversation_transcript(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_evaluation(UUID, INT, TEXT, TEXT[], JSONB, VARCHAR) TO authenticated, service_role;

-- Usage Stats Function
CREATE OR REPLACE FUNCTION get_agent_usage_stats(p_tenant_id UUID)
RETURNS TABLE (
    agent_id UUID,
    total_tokens NUMERIC,
    total_messages NUMERIC,
    total_stt NUMERIC,
    total_tts NUMERIC,
    recorded_cost NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH metrics_agg AS (
        SELECT 
            cm.agent_id,
            SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END) as total_tokens,
            SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END) as total_messages_recorded,
            SUM(CASE WHEN cm.metric_type = 'stt_minutes' THEN cm.value ELSE 0 END) as total_stt,
            SUM(CASE WHEN cm.metric_type = 'tts_minutes' THEN cm.value ELSE 0 END) as total_tts,
            SUM(cm.cost) as total_cost
        FROM consumption_metrics cm
        WHERE cm.tenant_id = p_tenant_id
        GROUP BY cm.agent_id
    ),
    msg_agg AS (
        SELECT 
            conv.agent_id,
            COUNT(*) as total_messages_synthetic
        FROM messages m
        JOIN conversations conv ON m.conversation_id = conv.id
        WHERE m.tenant_id = p_tenant_id
        GROUP BY conv.agent_id
    )
    SELECT 
        COALESCE(metrics.agent_id, msgs.agent_id) as agent_id,
        COALESCE(metrics.total_tokens, 0) as total_tokens,
        GREATEST(COALESCE(metrics.total_messages_recorded, 0), COALESCE(msgs.total_messages_synthetic, 0)) as total_messages,
        COALESCE(metrics.total_stt, 0) as total_stt,
        COALESCE(metrics.total_tts, 0) as total_tts,
        COALESCE(metrics.total_cost, 0) as recorded_cost
    FROM metrics_agg metrics
    FULL OUTER JOIN msg_agg msgs ON metrics.agent_id = msgs.agent_id;
END;
$$;

-- ============================================================================
-- TRANSACTIONAL AGENT FRAMEWORK (B2B Identity Gate)
-- MVP Phase 1: Security Sessions and Gateway RPC
-- ============================================================================

-- 1. Create Enum for Security Status
DO $$ BEGIN
    CREATE TYPE session_security_status AS ENUM ('unauthenticated', 'active', 'locked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Security Sessions Table
CREATE TABLE IF NOT EXISTS public.conversation_security_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    status session_security_status DEFAULT 'unauthenticated',
    validated_identifier VARCHAR(255),
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: Only one session per conversation/agent combo
    UNIQUE (conversation_id, agent_id)
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_conv_sec_session_conv ON public.conversation_security_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_sec_agent ON public.conversation_security_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_conv_sec_expires ON public.conversation_security_sessions(expires_at);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.conversation_security_sessions ENABLE ROW LEVEL SECURITY;

-- Policy to allow dashboard users to view sessions associated with their tenant's conversations
CREATE POLICY "Users can view security sessions of their tenant's conversations"
    ON public.conversation_security_sessions FOR SELECT
    USING (
        conversation_id IN (
            SELECT id FROM public.conversations
            WHERE tenant_id IN (
                SELECT c.id FROM public.companies c
                WHERE c.id = auth.uid() OR c.id IN (
                    SELECT tenant_id FROM public.users WHERE id = auth.uid()
                )
            )
        )
    );

-- 5. RPC Security Brain (evaluate_conversation_security)
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(
    p_agent_id UUID,
    p_conversation_id UUID,
    p_intent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_agent_config JSONB;
    v_identity_gate JSONB;
    v_is_enabled BOOLEAN;
    v_protected_intents TEXT[];
    v_session RECORD;
BEGIN
    -- Step 1: Get Agent Capabilities
    SELECT brain_config INTO v_agent_config 
    FROM public.agents 
    WHERE id = p_agent_id;

    v_identity_gate := v_agent_config->'capabilities'->'identity_gate';
    v_is_enabled := COALESCE((v_identity_gate->>'enabled')::boolean, false);
    
    -- Feature Flag Rollout Strategy (Allow execution if security gate is disabled)
    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object(
            'allowToolExecution', true,
            'requiresValidation', false,
            'session_status', 'unauthenticated'
        );
    END IF;

    -- Extract protected intents arrays safely
    IF v_identity_gate->'protected_intents' IS NOT NULL AND jsonb_typeof(v_identity_gate->'protected_intents') = 'array' THEN
        SELECT ARRAY(
            SELECT jsonb_array_elements_text(v_identity_gate->'protected_intents')
        ) INTO v_protected_intents;
    ELSE
        v_protected_intents := ARRAY[]::TEXT[];
    END IF;

    -- If intent is not protected, allow it
    IF NOT (p_intent = ANY(v_protected_intents)) THEN
        RETURN jsonb_build_object(
            'allowToolExecution', true,
            'requiresValidation', false,
            'session_status', 'unauthenticated'
        );
    END IF;

    -- Step 2: Check Session
    SELECT * INTO v_session
    FROM public.conversation_security_sessions
    WHERE conversation_id = p_conversation_id 
      AND agent_id = p_agent_id
    ORDER BY created_at DESC 
    LIMIT 1;

    -- Lazy Expiration Check
    IF v_session.expires_at IS NOT NULL AND v_session.expires_at < now() AND v_session.status = 'active' THEN
        UPDATE public.conversation_security_sessions 
        SET status = 'expired', updated_at = now()
        WHERE id = v_session.id;
        v_session.status := 'expired';
    END IF;

    -- Step 3: Evaluate Output
    IF v_session IS NOT NULL AND v_session.status = 'active' THEN
        -- Granted!
        RETURN jsonb_build_object(
            'allowToolExecution', true,
            'requiresValidation', false,
            'session_status', 'active',
            'validated_identifier', v_session.validated_identifier
        );
    ELSE
        -- Denied / Needs Validation
        RETURN jsonb_build_object(
            'allowToolExecution', false,
            'requiresValidation', true,
            'session_status', COALESCE(v_session.status::text, 'unauthenticated')
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.attempt_session_authentication(
    p_agent_id UUID,
    p_conversation_id UUID,
    p_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_cleaned_identifier TEXT;
BEGIN
    -- 1. Limpa a formatação (ex: tira traços e pontos do CNPJ/CPF)
    v_cleaned_identifier := regexp_replace(p_identifier, '\D', '', 'g');

    -- 2. Busca a sessão atual
    SELECT * INTO v_session
    FROM public.conversation_security_sessions
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id;

    IF v_session IS NULL THEN
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status)
        VALUES (p_conversation_id, p_agent_id, 'unauthenticated')
        RETURNING * INTO v_session;
    END IF;

    -- 3. BRUTE FORCE PROTECTION
    IF v_session.status = 'locked' THEN
        IF v_session.locked_until > now() THEN
            RETURN jsonb_build_object(
                'success', false, 
                'message', 'Security Triggered: Sessão bloqueada por excesso de tentativas. Tente novamente mais tarde.'
            );
        ELSE
            UPDATE public.conversation_security_sessions 
            SET status = 'unauthenticated', failed_attempts = 0, locked_until = NULL, updated_at = now()
            WHERE id = v_session.id;
            v_session.status := 'unauthenticated';
            v_session.failed_attempts := 0;
        END IF;
    END IF;

    -- 4. IDENTITY VALIDATION (MVP Sintática 11 ou 14 chars)
    IF length(v_cleaned_identifier) = 11 OR length(v_cleaned_identifier) = 14 THEN
        UPDATE public.conversation_security_sessions
        SET status = 'active', 
            validated_identifier = v_cleaned_identifier,
            failed_attempts = 0,
            expires_at = now() + interval '1 hour',
            updated_at = now()
        WHERE id = v_session.id;

        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Autenticação concluída! O Gatekeeper de Segurança está aberto.'
        );
    ELSE
        UPDATE public.conversation_security_sessions
        SET failed_attempts = failed_attempts + 1,
            status = CASE WHEN failed_attempts + 1 >= 5 THEN 'locked' ELSE 'unauthenticated' END,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
            updated_at = now()
        WHERE id = v_session.id
        RETURNING failed_attempts, status INTO v_session;

        IF v_session.status = 'locked' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'message', 'ACESSO BLOQUEADO: 5 tentativas falhas. A sessão foi trancada por 15 minutos.'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'message', 'Documento inválido. Tentativa ' || v_session.failed_attempts || ' de 5 antes do bloqueio.'
            );
        END IF;
    END IF;
END;
$$;
