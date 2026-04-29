-- Davos Nexus - Migration: Dynamic Gatekeeper & Universal Access Keys (V7)
-- Date: 2026-03-18
-- Description: Implementa a infraestrutura para segurança dinâmica via sub-agentes.

-- 1. Evolução das Tabelas
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_gatekeeper BOOLEAN DEFAULT FALSE;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS gatekeeper_scope VARCHAR(20) DEFAULT 'specific' CHECK (gatekeeper_scope IN ('specific', 'tenant'));
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS requires_security BOOLEAN DEFAULT FALSE;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS gatekeeper_config JSONB DEFAULT '{}'::jsonb;

-- 2. Evolução de Ferramentas
ALTER TABLE public.agent_tools ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'query' CHECK (category IN ('query', 'action', 'access_key'));

-- 3. Evolução de Conversas
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS active_agent_id UUID REFERENCES public.agents(id);

-- 4. Função Principal: Orquestrador V7
CREATE OR REPLACE FUNCTION public.n8n_orchestrator_v7(
    p_instance_name TEXT,
    p_user_identifier TEXT,
    p_user_name TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Dados do Agente Pai (Original)
    v_parent_agent_id UUID;
    v_tenant_id UUID;
    v_parent_requires_security BOOLEAN;
    
    -- Dados do Agente em Serviço (Pode ser o Pai ou o Gatekeeper)
    v_active_agent_id UUID;
    v_agent_id UUID;
    v_agent_name TEXT;
    v_agent_status VARCHAR;
    v_agent_config JSONB;
    v_context_window INT;
    v_lifecycle_stage VARCHAR;
    v_autonomy_level INT;
    v_whatsapp_api_type TEXT;
    v_meta_api_token TEXT;
    v_applied_policies TEXT[];
    
    -- Governança
    v_company_status VARCHAR;
    v_max_concurrency INT;
    v_active_conv_count INT;
    v_agente_encontrado BOOLEAN := FALSE;
    v_agente_ativo BOOLEAN := FALSE;
    v_empresa_ativa BOOLEAN := FALSE;
    v_limite_atingido BOOLEAN := FALSE;
    v_user_banned BOOLEAN := FALSE;
    v_contact_status VARCHAR;
    v_risk_score FLOAT := 0.0;
    v_governance_rules JSONB;
    
    -- Segurança
    v_session_status TEXT := 'unauthenticated';
    v_session_identifier TEXT := NULL;
    
    -- Conversa
    v_conversation_id UUID;
    v_clean_identifier TEXT;
    v_reopened BOOLEAN := FALSE;
    
    -- Sub-agentes e Tools
    v_sub_agents JSONB;
    v_tools JSONB;
BEGIN
    v_clean_identifier := split_part(p_user_identifier, '@', 1);

    -- 1. IDENTIFICA O AGENTE PAI (Dono da Instância)
    SELECT id, tenant_id, requires_security, max_concurrency
    INTO v_parent_agent_id, v_tenant_id, v_parent_requires_security, v_max_concurrency
    FROM public.agents 
    WHERE evolution_instance = p_instance_name LIMIT 1;

    IF v_parent_agent_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Agente não encontrado para esta instância.');
    END IF;

    -- 2. GESTÃO DE CONVERSA (Busca ou Cria)
    SELECT id, active_agent_id INTO v_conversation_id, v_active_agent_id FROM public.conversations 
    WHERE tenant_id = v_tenant_id AND agent_id = v_parent_agent_id AND user_identifier = v_clean_identifier 
    ORDER BY created_at DESC LIMIT 1;

    IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (tenant_id, agent_id, active_agent_id, user_identifier, user_name, channel, status, metadata) 
        VALUES (v_tenant_id, v_parent_agent_id, v_parent_agent_id, v_clean_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata) 
        RETURNING id INTO v_conversation_id;
        v_active_agent_id := v_parent_agent_id;
    END IF;

    -- 3. VERIFICA SESSÃO DE SEGURANÇA ATIVA
    SELECT status, validated_identifier INTO v_session_status, v_session_identifier
    FROM public.conversation_security_sessions
    WHERE conversation_id = v_conversation_id
      AND status = 'active'
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;

    -- 4. LÓGICA DE GATEKEEPER (Decisão de Desvio)
    -- Se o pai exige segurança e NÃO temos sessão ativa, desviamos para o Gatekeeper
    IF v_parent_requires_security AND COALESCE(v_session_status, 'unauthenticated') != 'active' THEN
        -- Busca o Gatekeeper (1º Específico, 2º Tenant)
        SELECT id INTO v_active_agent_id
        FROM public.agents
        WHERE tenant_id = v_tenant_id 
          AND is_gatekeeper = TRUE
          AND (parent_agent_id = v_parent_agent_id OR gatekeeper_scope = 'tenant')
          AND status = 'active'
        ORDER BY (parent_agent_id = v_parent_agent_id) DESC, created_at DESC
        LIMIT 1;
        
        -- Se não achou gatekeeper específico nem do tenant, mantem o pai (mas sem ferramentas protegidas)
        IF v_active_agent_id IS NULL THEN
            v_active_agent_id := v_parent_agent_id;
        END IF;

        UPDATE public.conversations SET active_agent_id = v_active_agent_id WHERE id = v_conversation_id;
    ELSE
        -- Retorna ao Agente Pai (Vendas)
        v_active_agent_id := v_parent_agent_id;
        UPDATE public.conversations SET active_agent_id = v_active_agent_id WHERE id = v_conversation_id;
    END IF;

    -- 5. BUSCA DADOS DO AGENTE ATIVO (SEJA ELE PAI OU GATEKEEPER)
    SELECT id, name, status, brain_config, lifecycle_stage::VARCHAR, autonomy_level, context_window, 
           whatsapp_api_type, meta_api_token, applied_policies
    INTO v_agent_id, v_agent_name, v_agent_status, v_agent_config, v_lifecycle_stage, v_autonomy_level, v_context_window, 
         v_whatsapp_api_type, v_meta_api_token, v_applied_policies
    FROM public.agents 
    WHERE id = v_active_agent_id;

    -- 6. VALIDAÇÕES DE GOVERNANÇA E EMPRESA
    v_agente_encontrado := (v_agent_id IS NOT NULL);
    v_agente_ativo := (v_agent_status = 'active');
    
    SELECT status INTO v_company_status FROM public.companies WHERE id = v_tenant_id;
    v_empresa_ativa := (v_company_status = 'active');

    SELECT COUNT(*) INTO v_active_conv_count FROM public.conversations 
    WHERE agent_id = v_parent_agent_id AND status = 'ai_active'; -- Concorrência conta no Agente Pai
    v_limite_atingido := (v_active_conv_count > v_max_concurrency);

    -- Risco e Banimento
    SELECT status INTO v_contact_status FROM public.contacts 
    WHERE tenant_id = v_tenant_id AND identifier = v_clean_identifier;
    v_user_banned := (v_contact_status = 'banned');

    -- Cálculo de Risco
    SELECT COALESCE(SUM(CASE 
            WHEN i.severity::text = 'critical' THEN 3.0
            WHEN i.severity::text = 'high' THEN 1.0
            ELSE 0.3 END), 0.0) INTO v_risk_score
    FROM public.incidents i JOIN public.conversations c ON i.conversation_id = c.id
    WHERE c.user_identifier = v_clean_identifier AND i.status = 'open' AND i.created_at >= NOW() - INTERVAL '24 hours';
    
    -- Busca de Políticas
    IF v_applied_policies IS NOT NULL AND array_length(v_applied_policies, 1) > 0 THEN
        SELECT jsonb_build_object(
            'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
            'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
            'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb)
        ) INTO v_governance_rules;
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
    END IF;

    -- 7. BUSCA DE FERRAMENTAS DO AGENTE ATIVO
    SELECT jsonb_agg(tool_sub) INTO v_tools
    FROM (
        SELECT 
            name, description, parameters_schema as parameters,
            method, url, headers, category -- Categoria incluída para o n8n saber se é access_key
        FROM public.agent_tools
        WHERE tenant_id = v_tenant_id
          AND (agent_id = v_agent_id OR agent_id IS NULL)
          AND is_active = TRUE
    ) tool_sub;

    -- 8. RETORNO CONSOLIDADO
    RETURN jsonb_build_object(
        'status', CASE WHEN NOT v_agente_encontrado OR NOT v_agente_ativo OR NOT v_empresa_ativa OR v_limite_atingido OR v_user_banned THEN 'blocked' ELSE 'success' END,
        'governance', jsonb_build_object(
            'agente_encontrado', v_agente_encontrado,
            'agente_ativo', v_agente_ativo,
            'empresa_ativa', v_empresa_ativa,
            'limite_atingido', v_limite_atingido,
            'user_banned', v_user_banned,
            'risk_score', v_risk_score,
            'max_concurrency', v_max_concurrency,
            'lifecycle_stage', v_lifecycle_stage,
            'autonomy_level', v_autonomy_level,
            'rules', v_governance_rules
        ),
        'agent', jsonb_build_object(
            'id', v_agent_id,
            'name', v_agent_name,
            'role', CASE WHEN v_agent_id = v_parent_agent_id THEN 'conversational' ELSE 'gatekeeper' END,
            'tenantId', v_tenant_id,
            'greetingMessage', v_agent_config->>'greetingMessage',
            'systemPrompt', v_agent_config->>'systemPrompt',
            'modelId', v_agent_config->>'modelId',
            'temperature', (v_agent_config->>'temperature')::NUMERIC,
            'contextWindow', v_context_window,
            'whatsapp_api_type', v_whatsapp_api_type,
            'meta_api_token', v_meta_api_token,
            'tools', COALESCE(v_tools, '[]'::jsonb)
        ),
        'conversation', jsonb_build_object(
            'id', v_conversation_id,
            'session_status', COALESCE(v_session_status, 'unauthenticated'),
            'session_identifier', v_session_identifier
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.n8n_orchestrator_v7(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.n8n_orchestrator_v7(text, text, text, jsonb) TO service_role;
