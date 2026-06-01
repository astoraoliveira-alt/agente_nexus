-- =============================================
-- RPC: close_idle_conversations (Multi-Provider Support)
-- Purpose: Closes idle conversations and returns routing info for notifications.
-- Versão: 2026.05.29 (Includes Batch Limit to prevent Statement Timeout)
-- =============================================

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
        -- LIMIT adicionado aqui previne que o banco de dados trave ao tentar processar um backlog muito grande de uma vez
        LIMIT 500
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
    )
    -- 3. Gerar JSON para o n8n incluindo o TEMPLATE da Campanha
    SELECT jsonb_agg(
        jsonb_build_object(
            'conversation_id', u.id,
            'phone', regexp_replace(u.user_identifier, '\D', '', 'g'),
            'provider', COALESCE(a.whatsapp_provider, 'evolution'),
            'agent_id', u.agent_id,
            'tenant_id', u.tenant_id,
            -- Evolution Fields
            'instance', a.evolution_instance,
            'evolution_token', a.evolution_token,
            -- Meta Fields
            'meta_api_token', a.meta_api_token,
            'meta_phone_number_id', a.meta_phone_number_id,
            -- Zenvia Fields
            'zenvia_api_token', a.zenvia_api_token,
            'zenvia_channel_id', a.zenvia_channel_id,
            -- Campaign Template (Fills the missing field in n8n)
            'template_id', COALESCE(
                camp.reengagement_template_id, 
                (camp.metadata->>'template_id')::text
            )
        )
    ) INTO v_closed_list
    FROM updated_rows u
    JOIN public.agents a ON a.id = u.agent_id
    -- Join lateral para pegar a campanha vinculada a essa conversa via outbound_queue
    LEFT JOIN LATERAL (
        SELECT c.reengagement_template_id, c.metadata
        FROM public.outbound_queue oq
        JOIN public.campaigns c ON c.id = oq.campaign_id
        WHERE oq.conversation_id = u.id
        ORDER BY oq.created_at DESC
        LIMIT 1
    ) camp ON TRUE
    WHERE u.should_notify = TRUE;

    -- 4. Return as Array
    RETURN COALESCE(v_closed_list, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO service_role;
