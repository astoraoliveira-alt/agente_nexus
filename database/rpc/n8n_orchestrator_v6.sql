-- Davos Nexus - RPC: n8n_orchestrator_v6
-- Description: Consolidated orchestrator for n8n. Now includes dynamic tools.

CREATE OR REPLACE FUNCTION public.n8n_orchestrator_v6(
    p_agent_id UUID,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_agent_record RECORD;
    v_available_tools JSONB;
    v_available_subagents JSONB;
    v_company_slug TEXT;
BEGIN
    -- 1. Get Agent & Company Data
    SELECT 
        a.*,
        c.slug as company_slug
    INTO v_agent_record
    FROM public.agents a
    JOIN public.companies c ON c.id = a.tenant_id
    WHERE a.id = p_agent_id AND a.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Agent not found');
    END IF;

    -- 2. Fetch Dynamic Tools from agent_tools
    -- We get tools linked to this agent OR general tools for the tenant (agent_id IS NULL)
    SELECT jsonb_agg(jsonb_build_object(
        'name', name,
        'description', description,
        'parameters', parameters_schema
    )) INTO v_available_tools
    FROM public.agent_tools
    WHERE tenant_id = p_tenant_id 
    AND (agent_id = p_agent_id OR agent_id IS NULL)
    AND is_active = TRUE;

    -- 3. Fetch Sub-agents (Handoff)
    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'role', role,
        'description', role -- Or use a specific handoff description if added later
    )) INTO v_available_subagents
    FROM public.agents
    WHERE tenant_id = p_tenant_id 
    AND parent_agent_id = p_agent_id 
    AND status = 'active';

    -- 4. Build Final Response for n8n
    RETURN jsonb_build_object(
        'agent', jsonb_build_object(
            'id', v_agent_record.id,
            'name', v_agent_record.name,
            'role', v_agent_record.role,
            'system_prompt', v_agent_record.brain_config->>'systemPrompt',
            'lifecycle_stage', v_agent_record.lifecycle_stage,
            'autonomy_level', v_agent_record.autonomy_level,
            'brain_config', v_agent_record.brain_config
        ),
        'company', jsonb_build_object(
            'slug', v_agent_record.company_slug
        ),
        'capabilities', jsonb_build_object(
            'tools', COALESCE(v_available_tools, '[]'::jsonb),
            'sub_agents', COALESCE(v_available_subagents, '[]'::jsonb)
        )
    );
END;
$$;
