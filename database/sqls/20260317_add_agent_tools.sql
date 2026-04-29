-- Davos Nexus - Migration: Create Agent Tools Table
-- Date: 2026-03-17
-- Description: Allows dynamic HTTP tool configuration per tenant for n8n orchestration.

CREATE TABLE IF NOT EXISTS public.agent_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE, -- Optional: link to specific agent
    
    -- Function Calling Info (for AI)
    name VARCHAR(255) NOT NULL, -- Technical name (snake_case)
    description TEXT NOT NULL, -- Guide for the LLM
    parameters_schema JSONB DEFAULT '{"type": "object", "properties": {}}'::jsonb, -- OpenAI JSON Schema
    
    -- HTTP Configuration (for n8n)
    method VARCHAR(10) DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
    url TEXT NOT NULL,
    headers JSONB DEFAULT '{}'::jsonb, -- Extra/Auth headers
    query_params JSONB DEFAULT '{}'::jsonb,
    body_mapping JSONB DEFAULT '{}'::jsonb, -- Mapping logic if needed
    
    -- Output Configuration
    response_mode VARCHAR(20) DEFAULT 'json' CHECK (response_mode IN ('json', 'text')),
    output_schema JSONB, -- Optional: structure to return to the AI
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Multi-tenancy Safety
    UNIQUE(tenant_id, name)
);

-- RLS
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Manage Own Tools" ON public.agent_tools;
DROP POLICY IF EXISTS "agent_tools_access_safe" ON public.agent_tools;

CREATE POLICY "agent_tools_access_safe" ON public.agent_tools
FOR ALL 
TO authenticated
USING (
    tenant_id = public.get_current_user_tenant_id()
    OR 
    public.get_current_user_role() = 'super_admin'
)
WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    OR 
    public.get_current_user_role() = 'super_admin'
);

-- Index for n8n lookup performance
CREATE INDEX IF NOT EXISTS idx_agent_tools_lookup ON public.agent_tools(tenant_id, name) WHERE is_active = TRUE;
