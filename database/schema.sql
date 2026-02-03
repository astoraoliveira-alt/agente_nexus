-- Davos Nexus - Database Schema (PostgreSQL / Supabase)
-- Version: 1.0.0
-- Generated: 2026-02-02
-- Compliance: ISO 42001 / LGPD
--
-- 🔴 CRITICAL: This file is the SINGLE SOURCE OF TRUTH for the database structure.
-- ANY change made in Supabase Dashboard MUST be reflected here immediately.

-- =============================================
-- BRAZIL STANDARD CONFIGURATION
-- =============================================
SET TIMEZONE TO 'America/Sao_Paulo';
SET DATESTYLE TO 'Postgres, DMY'; -- Forces DD/MM/YYYY output in CLI/Logs

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUMS (Strict Consistency)
-- =============================================
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'trial');
CREATE TYPE plan_type AS ENUM ('fixed', 'flex', 'unlimited');
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

-- =============================================
-- 1. COMPANIES & PLANS (Tenancy Root)
-- =============================================

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE, -- Functional Namespace
    status tenant_status DEFAULT 'trial',
    plan_tier plan_type DEFAULT 'fixed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ISO Management (Accountability)
    ai_system_owner_id UUID,
    risk_owner_id UUID,
    compliance_officer_id UUID,

    -- Security for N8N/External Access
    api_key VARCHAR(1024), -- To be sent by N8N in Bearer Auth

    -- JSON Configuration (Plan Details are complex)
    plan_details JSONB DEFAULT '{}'::jsonb, -- Limits, Prices
    privacy_settings JSONB DEFAULT '{"anonymization": false, "retention_days": 365}'::jsonb
);

CREATE INDEX idx_companies_slug ON companies(slug);

-- =============================================
-- 2. USERS & RBAC
-- =============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES companies(id), -- Nullable for Super Admins? Ideally strict.
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(1024),
    role VARCHAR(50) DEFAULT 'viewer', -- Simple Role or ref to Roles table
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);

-- =============================================
-- 3. AGENTS (The Core)
-- =============================================

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    status agent_status DEFAULT 'active',
    
    -- Capacity & Usage
    active_conversations INT DEFAULT 0,
    total_conversations INT DEFAULT 0,
    max_concurrency INT DEFAULT 50,

    -- Risk & Governance (ISO 42001)
    risk_level risk_level DEFAULT 'low',
    risk_score INT DEFAULT 0, -- 0-100
    lifecycle_stage lifecycle_stage DEFAULT 'development',
    autonomy_level INT DEFAULT 1 CHECK (autonomy_level BETWEEN 1 AND 5),

    -- Configuration (Source of Truth for N8N)
    -- Stores system_prompt, model_id, temperature
    brain_config JSONB NOT NULL DEFAULT '{}'::jsonb, 
    
    -- Voice Config (Retell / ElevenLabs)
    voice_config JSONB DEFAULT '{}'::jsonb,

    channels TEXT[], -- Array of strings ['text', 'voice']
    applied_policies TEXT[], -- Array of Policy IDs/Names

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agents_tenant ON agents(tenant_id);

-- =============================================
-- 4. GOVERNANCE & LOGS
-- =============================================

CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    rules JSONB NOT NULL, -- { canDo: [], cannotDo: [] }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE incidents (
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
    
    attachments JSONB DEFAULT '[]'::jsonb -- Array of URLs
);

-- =============================================
-- 5. CONVERSATIONAL FLOWS
-- =============================================

CREATE TABLE flows (
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

CREATE TABLE flow_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- greeting, qualification...
    description TEXT,
    expected_outcome TEXT,
    actor flow_actor DEFAULT 'ai',
    escalation_rule VARCHAR(255) -- N8N trigger key
);

CREATE INDEX idx_flow_stages_flow ON flow_stages(flow_id);

-- Link Agents to Flows (N:N)
CREATE TABLE agent_flows (
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    flow_id UUID REFERENCES flows(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (agent_id, flow_id)
);

-- =============================================
-- 6. CONVERSATIONS & MESSAGES
-- =============================================

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID REFERENCES agents(id),
    user_identifier VARCHAR(255), -- Phone or UserID
    user_name VARCHAR(255),
    
    channel conversation_channel NOT NULL,
    status conversation_status DEFAULT 'ai_active',
    
    assigned_operator_id UUID REFERENCES users(id),
    
    current_flow_id UUID REFERENCES flows(id),
    current_stage_id UUID REFERENCES flow_stages(id),
    
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Realtime Status (Ephemeral, but persisted for recovery)
    voice_status VARCHAR(50), -- speaking, listening
    is_simulation BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_agent ON conversations(agent_id);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES companies(id),
    
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text', -- text, audio, image
    sender_type VARCHAR(20) NOT NULL, -- user, ai, human
    sender_name VARCHAR(255),
    
    -- Metadata
    audio_url VARCHAR(1024),
    transcription TEXT,
    image_url VARCHAR(1024),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- =============================================
-- 7. CONSUMPTION & METRICS
-- =============================================

CREATE TABLE consumption_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID REFERENCES agents(id),
    
    channel conversation_channel NOT NULL,
    metric_type metric_type NOT NULL,
    
    value NUMERIC NOT NULL, -- Token count, minutes
    cost NUMERIC(10, 4) NOT NULL, -- 0.0000 precision
    currency VARCHAR(3) DEFAULT 'BRL',
    
    metadata JSONB, -- Provider info, external IDs
    
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_consumption_tenant_date ON consumption_metrics(tenant_id, recorded_at);

-- =============================================
-- 8. AUDIT LOG (Immutable)
-- =============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    actor_id UUID, -- System or User
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

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
