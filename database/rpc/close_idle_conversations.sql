-- =============================================
-- RPC: close_idle_conversations (Multi-Provider Support)
-- Purpose: Closes idle conversations and returns routing info for notifications.
-- Versão: 2026.04.20
-- =============================================

CREATE OR REPLACE FUNCTION public.close_idle_conversations(p_idle_minutes INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closed_list JSONB;
BEGIN
    -- 1. Identificar conversas a fechar e filtrar duplicados para evitar notificações falsas
    WITH group_status AS (
        SELECT 
            id, 
            user_identifier, 
            agent_id, 
            tenant_id,
            last_message_at,
            created_at,
            ROW_NUMBER() OVER(PARTITION BY tenant_id, agent_id, user_identifier ORDER BY created_at DESC) as rank
        FROM public.conversations
        WHERE status IN ('ai_active', 'human_active')
    ),
    to_close AS (
        -- Fecha todos os que passaram do tempo OU que são duplicados (rank > 1)
        SELECT 
            id, 
            (rank = 1 AND (
                last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval) 
                OR 
                (last_message_at IS NULL AND created_at < (NOW() - (p_idle_minutes || ' minutes')::interval))
            )) as should_notify
        FROM group_status
        WHERE 
            (last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval) OR (last_message_at IS NULL AND created_at < (NOW() - (p_idle_minutes || ' minutes')::interval)))
            OR rank > 1
    ),
    updated AS (
        UPDATE public.conversations c
        SET status = 'closed',
            last_message_at = COALESCE(c.last_message_at, NOW()),
            updated_at = NOW()
        FROM to_close t
        WHERE c.id = t.id
        RETURNING c.id, c.user_identifier, c.agent_id, c.tenant_id, t.should_notify
    )
    -- 2. Enriquece apenas o registro mais recente que expirou (evita notificação de duplicados antigos)
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
            'zenvia_channel_id', a.zenvia_channel_id
        )
    ) INTO v_closed_list
    FROM updated u
    JOIN public.agents a ON a.id = u.agent_id
    WHERE u.should_notify = TRUE;

    -- 3. Return as Array
    RETURN COALESCE(v_closed_list, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO service_role;
