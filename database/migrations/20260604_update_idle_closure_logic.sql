-- =============================================
-- Migration: 20260604_update_idle_closure_logic.sql
-- Purpose: Add configurable idle closure to agents and internal log.
-- =============================================

-- 1. Adicionar as configurações na tabela agents
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS send_idle_closure_message BOOLEAN DEFAULT false;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS idle_closure_message TEXT;

-- 2. Atualizar a função close_idle_conversations
CREATE OR REPLACE FUNCTION public.close_idle_conversations(p_idle_minutes INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closed_list JSONB;
BEGIN
    -- 1. Identificar conversas ociosas (Rank 1 = Mais recente por usuário/agente)
    WITH current_sessions AS (
        SELECT 
            id, tenant_id, agent_id, user_identifier, last_message_at, created_at,
            ROW_NUMBER() OVER(PARTITION BY tenant_id, agent_id, user_identifier ORDER BY created_at DESC) as rank
        FROM public.conversations
        WHERE status IN ('ai_active', 'human_active')
    ),
    target_actions AS (
        SELECT 
            id,
            (rank = 1 AND (last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval) OR last_message_at IS NULL)) as should_notify
        FROM current_sessions
        WHERE 
            (rank = 1 AND (last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval) OR last_message_at IS NULL))
            OR rank > 1
        LIMIT 1000
    ),
    -- 2. Atualizar status para 'closed'
    updated_rows AS (
        UPDATE public.conversations c
        SET status = 'closed',
            last_message_at = COALESCE(c.last_message_at, NOW()),
            updated_at = NOW()
        FROM target_actions t
        WHERE c.id = t.id
        RETURNING c.id, c.user_identifier, c.agent_id, c.tenant_id, t.should_notify
    ),
    -- 3. Inserir Log Interno na Tabela de Mensagens
    inserted_logs AS (
        INSERT INTO public.messages (conversation_id, tenant_id, content, sender_type, created_at)
        SELECT 
            u.id,
            u.tenant_id,
            'Atendimento encerrado automaticamente pelo sistema devido à inatividade.',
            'system',
            NOW()
        FROM updated_rows u
        WHERE u.should_notify = TRUE
        RETURNING id
    )
    -- 4. Gerar JSON para o n8n incluindo o TEMPLATE da Campanha e configs do agente
    SELECT jsonb_agg(
        jsonb_build_object(
            'conversation_id', u.id,
            'phone', regexp_replace(u.user_identifier, '\D', '', 'g'),
            'provider', COALESCE(a.whatsapp_provider, 'evolution'),
            'agent_id', u.agent_id,
            'tenant_id', u.tenant_id,
            -- Agent Idle Message Configs
            'send_idle_closure_message', COALESCE(a.send_idle_closure_message, false),
            'idle_closure_message', a.idle_closure_message,
            -- Evolution Fields
            'instance', a.evolution_instance,
            'evolution_token', a.evolution_token,
            -- Meta Fields
            'meta_api_token', a.meta_api_token,
            'meta_phone_number_id', a.meta_phone_number_id,
            -- Zenvia Fields
            'zenvia_api_token', a.zenvia_api_token,
            'zenvia_channel_id', a.zenvia_channel_id,
            -- Campaign Template
            'template_id', COALESCE(
                camp.reengagement_template_id, 
                (camp.metadata->>'template_id')::text
            )
        )
    ) INTO v_closed_list
    FROM updated_rows u
    JOIN public.agents a ON a.id = u.agent_id
    LEFT JOIN LATERAL (
        SELECT c.reengagement_template_id, c.metadata
        FROM public.outbound_queue oq
        JOIN public.campaigns c ON c.id = oq.campaign_id
        WHERE oq.conversation_id = u.id
        ORDER BY oq.created_at DESC
        LIMIT 1
    ) camp ON TRUE
    WHERE u.should_notify = TRUE;

    -- 5. Return as Array
    RETURN COALESCE(v_closed_list, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO service_role;
