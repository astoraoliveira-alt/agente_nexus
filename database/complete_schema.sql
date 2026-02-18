-- Davos Nexus - Complete Database Schema (Consolidated)
-- Generated: 2026-02-17
-- 
-- 🔴 CRITICAL: This file is the SINGLE SOURCE OF TRUTH for the database structure.
-- It combines the base schema with all modules (Plans, Evaluations, Knowledge Base, Audit).

-- =============================================
-- BRAZIL STANDARD CONFIGURATION
-- =============================================
SET TIMEZONE TO 'America/Sao_Paulo';
SET DATESTYLE TO 'Postgres, DMY'; 

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUMS
-- =============================================
DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'trial');
    CREATE TYPE plan_type AS ENUM ('fixed', 'flex', 'unlimited', 'enterprise'); -- 'enterprise' added from plans table usage
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
    plan_tier plan_type DEFAULT 'fixed',
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
    privacy_settings JSONB DEFAULT '{"anonymization": false, "retention_days": 365}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin Delete Companies" ON companies;
CREATE POLICY "Super Admin Delete Companies" ON companies FOR DELETE USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

DROP POLICY IF EXISTS "Super Admin Insert Companies" ON companies;
CREATE POLICY "Super Admin Insert Companies" ON companies FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies FOR SELECT USING (id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant Update Own Company" ON companies;
CREATE POLICY "Tenant Update Own Company" ON companies FOR UPDATE USING (id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plans RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Cleanup old policies (from previous script versions)
DROP POLICY IF EXISTS "Allow public read access" ON plans;
DROP POLICY IF EXISTS "Allow public write access" ON plans;
DROP POLICY IF EXISTS "Allow public update access" ON plans;
DROP POLICY IF EXISTS "Allow public delete access" ON plans;

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
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users Register Self" ON users;
CREATE POLICY "Users Register Self" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- 3. AGENTS
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

    -- Agent Type
    type VARCHAR(50) DEFAULT 'conversational' CHECK (type IN ('embedded', 'whatsapp', 'conversational')),

    channels TEXT[], 
    applied_policies TEXT[], 

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- AGENT KNOWLEDGE BASE (Added Module)
CREATE TABLE IF NOT EXISTS agent_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT, 
    file_url VARCHAR(1024), 
    file_type VARCHAR(50), 
    file_size INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_tenant ON agent_knowledge(tenant_id);

-- RLS for Knowledge Base
-- Cleanup old policies
DROP POLICY IF EXISTS "Users can view knowledge for their tenant" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can manage knowledge for their tenant" ON agent_knowledge;

DROP POLICY IF EXISTS "Tenant Manage Knowledge" ON agent_knowledge;
CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));


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
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity incident_severity DEFAULT 'medium',
    status incident_status DEFAULT 'open',
    reported_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    attachments JSONB DEFAULT '[]'::jsonb 
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Incidents" ON incidents;
CREATE POLICY "Tenant Read Incidents" ON incidents FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

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
-- 6. CONVERSATIONS & MESSAGES
-- =============================================

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    identifier VARCHAR(255) NOT NULL UNIQUE, 
    email VARCHAR(255),
    phone VARCHAR(255),
    avatar_url VARCHAR(1024),
    
    tags TEXT[] DEFAULT '{}',
    channel VARCHAR(50), 
    
    extra_info JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_identifier ON contacts(identifier);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Manage Contacts" ON contacts;
CREATE POLICY "Tenant Manage Contacts" ON contacts FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

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
    is_simulation BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES companies(id),
    
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text', 
    sender_type VARCHAR(20) NOT NULL, 
    sender_name VARCHAR(255),
    
    audio_url VARCHAR(1024),
    transcription TEXT,
    image_url VARCHAR(1024),
    
    -- VAPI Integ
    external_id VARCHAR(255),
    external_order INT,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS uq_messages_tenant_external_id;
ALTER TABLE messages ADD CONSTRAINT uq_messages_tenant_external_id UNIQUE (tenant_id, external_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- EVALUATIONS (Added Module)
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    
    score INT NOT NULL CHECK (score BETWEEN 0 AND 100), 
    
    summary TEXT, 
    tags TEXT[], 
    criteria_results JSONB DEFAULT '{}'::jsonb,
    
    ai_model VARCHAR(50), 
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_tenant ON evaluations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_conversation ON evaluations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_score ON evaluations(score);
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Cleanup old policy
DROP POLICY IF EXISTS "Allow tenant read access" ON evaluations;

DROP POLICY IF EXISTS "Tenant Insert Evaluations" ON evaluations;
CREATE POLICY "Tenant Insert Evaluations" ON evaluations FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant Read Evaluations" ON evaluations;
CREATE POLICY "Tenant Read Evaluations" ON evaluations FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- =============================================
-- 7. CONSUMPTION & METRICS
-- =============================================

CREATE TABLE IF NOT EXISTS consumption_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID REFERENCES agents(id),
    
    channel conversation_channel NOT NULL,
    metric_type metric_type NOT NULL,
    
    value NUMERIC NOT NULL, 
    cost NUMERIC(10, 4) NOT NULL, 
    currency VARCHAR(3) DEFAULT 'BRL',
    
    metadata JSONB, 
    
    department_id TEXT,
    cost_center TEXT,
    
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumption_tenant_date ON consumption_metrics(tenant_id, recorded_at);

ALTER TABLE consumption_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Consumption" ON consumption_metrics;
CREATE POLICY "Tenant Read Consumption" ON consumption_metrics FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- =============================================
-- 8. AUDIT LOGS
-- =============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    actor_id UUID, 
    actor_name VARCHAR(255),
    
    action VARCHAR(255) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID,
    
    state_before JSONB,
    state_after JSONB,
    details TEXT,
    
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Audit Logs" ON audit_logs;
CREATE POLICY "Tenant Access Audit Logs" ON audit_logs FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- INTEGRATION LOGS (Added Module)
CREATE TABLE IF NOT EXISTS integration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES companies(id),
    provider VARCHAR(50) DEFAULT 'vapi',
    external_id VARCHAR(255), 
    payload JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'success', 
    error_details TEXT
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_provider_ext ON integration_logs(provider, external_id);

ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Integration Logs" ON integration_logs;
CREATE POLICY "Tenant Access Integration Logs" ON integration_logs FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

ALTER TABLE integration_logs DROP CONSTRAINT IF EXISTS uq_integration_logs_provider_external_id;
ALTER TABLE integration_logs ADD CONSTRAINT uq_integration_logs_provider_external_id UNIQUE (provider, external_id); -- For Upsert logic

-- CHAT HISTORY MEMORY (LangChain/External)
CREATE TABLE IF NOT EXISTS chat_histories_memory (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    message JSONB NOT NULL
);

ALTER TABLE chat_histories_memory ENABLE ROW LEVEL SECURITY;
-- Note: No tenant_id, so we rely on Service Role for access or specific ID-based policies if needed later.
-- Defaulting to deny all for anon/auth to prevent leaks, assuming server-side usage only.

-- AGENT AUDIT LOGS (Added Module)
CREATE TABLE IF NOT EXISTS agent_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    actor_id UUID, 
    actor_name TEXT, 
    action VARCHAR(50) NOT NULL, 
    old_state JSONB,
    new_state JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Agent Logs" ON agent_audit_logs;
CREATE POLICY "Tenant Read Agent Logs" ON agent_audit_logs FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())));

-- PLAN AUDIT LOGS (Added Module)
CREATE TABLE IF NOT EXISTS plan_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    actor_id UUID, 
    action VARCHAR(50) NOT NULL, 
    old_state JSONB,
    new_state JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE plan_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin Read Plan Logs" ON plan_audit_logs;
CREATE POLICY "Super Admin Read Plan Logs" ON plan_audit_logs FOR SELECT USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

-- =============================================
-- 9. FUNCTIONS & TRIGGERS
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

-- Evaluation Functions
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
        INSERT INTO incidents (tenant_id, agent_id, title, description, severity, status) 
        VALUES (v_tenant_id, v_agent_id, 'Low Quality Interaction Detected (Score: ' || p_score || ')', 'Automated Audit Flag: ' || p_summary, 'medium', 'open');
    END IF;

    RETURN jsonb_build_object('success', true, 'evaluation_id', v_eval_id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversation_transcript(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_evaluation(UUID, INT, TEXT, TEXT[], JSONB, VARCHAR) TO authenticated, service_role;

-- Usage Stats Function (Updated Version)
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

-- Record Usage Function
CREATE OR REPLACE FUNCTION record_usage(
    p_agent_id TEXT,
    p_metric_type TEXT,
    p_value NUMERIC,
    p_cost NUMERIC,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_agent_uuid UUID;
    v_tenant_id UUID;
    v_new_id UUID;
    v_dept_id TEXT;
    v_cost_center TEXT;
    v_metric_key TEXT;
    v_alert_triggered BOOLEAN := false;
BEGIN
    v_agent_uuid := p_agent_id::UUID;
    SELECT tenant_id, department_id, cost_center INTO v_tenant_id, v_dept_id, v_cost_center FROM agents WHERE id = v_agent_uuid;
    IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Agent not found'; END IF;

    INSERT INTO consumption_metrics (tenant_id, agent_id, channel, metric_type, value, cost, metadata, department_id, cost_center, recorded_at)
    VALUES (
        v_tenant_id, v_agent_uuid, 
        (SELECT CASE WHEN type = 'whatsapp' THEN 'whatsapp'::conversation_channel WHEN type = 'embedded' THEN 'text'::conversation_channel ELSE 'text'::conversation_channel END FROM agents WHERE id = v_agent_uuid),
        p_metric_type::metric_type, p_value, p_cost, p_metadata, v_dept_id, v_cost_center, NOW()
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'metric_id', v_new_id);
END;
$$;
