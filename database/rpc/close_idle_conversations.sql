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
    -- 1. Update conversations and capture data
    WITH updated AS (
        UPDATE public.conversations
        SET status = 'closed',
            last_message_at = NOW(),
            updated_at = NOW()
        WHERE status IN ('ai_active', 'human_active')
          AND last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval)
        RETURNING id, user_identifier, agent_id, tenant_id
    )
    -- 2. Enrich with Agent/Provider details
    SELECT jsonb_agg(
        jsonb_build_object(
            'conversation_id', u.id,
            'phone', regexp_replace(u.user_identifier, '\D', '', 'g'),
            'provider', COALESCE(a.whatsapp_provider, 'evolution'),
            'agent_id', u.agent_id,
            'tenant_id', u.tenant_id,
            'evolution', jsonb_build_object(
                'instance', a.evolution_instance,
                'token', a.evolution_token
            ),
            'zenvia', jsonb_build_object(
                'token', a.zenvia_api_token,
                'channelId', a.zenvia_channel_id
            )
        )
    ) INTO v_closed_list
    FROM updated u
    JOIN public.agents a ON a.id = u.agent_id;

    -- 3. Return as Array
    RETURN COALESCE(v_closed_list, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO service_role;
