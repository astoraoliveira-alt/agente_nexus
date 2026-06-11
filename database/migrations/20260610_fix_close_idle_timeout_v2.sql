-- =============================================
-- Migration: 20260610_fix_close_idle_timeout_v2.sql
-- Purpose: Resolver timeout estrutural da close_idle_conversations.
--
-- ROOT CAUSE REAL (após análise):
--   1. ROW_NUMBER() escaneia TODAS as conversas ai_active/human_active
--      antes de qualquer filtro — após reengajamento com 2100+ mensagens
--      isso é um scan de milhares de linhas só para computar o rank.
--   2. LATERAL JOIN executa 1 query por linha em updated_rows,
--      mesmo com índice, N execuções = overhead acumulado.
--
-- FIXES ESTRUTURAIS:
--   1. Pre-filtra candidatas antes do ROW_NUMBER (só carrega o que importa)
--   2. Substitui LATERAL JOIN por LEFT JOIN com subquery agregada (1 scan total)
--   3. SET LOCAL statement_timeout como rede de segurança
--   4. Lógica de negócio preservada 100% (should_notify, rank > 1, etc.)
-- =============================================

CREATE OR REPLACE FUNCTION public.close_idle_conversations(p_idle_minutes INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closed_list JSONB;
    v_cutoff      TIMESTAMPTZ;
BEGIN
    SET LOCAL statement_timeout = '25s';

    v_cutoff := NOW() - (p_idle_minutes || ' minutes')::interval;

    WITH
    -- [FIX 1] Pre-filtra antes do ROW_NUMBER:
    -- Só carrega conversas que (a) já estão ociosas, (b) têm last_message_at NULL,
    -- ou (c) são potenciais duplicatas (há outra conversa ativa do mesmo usuário/agente).
    -- Isso reduz de "todas as ativas" para apenas o subconjunto relevante.
    candidates AS (
        SELECT id, tenant_id, agent_id, user_identifier, last_message_at, created_at
        FROM public.conversations c
        WHERE status IN ('ai_active', 'human_active')
          AND (
              -- Ociosas ou sem data
              last_message_at < v_cutoff
              OR last_message_at IS NULL
              -- Duplicatas: existe outra conversa ativa do mesmo usuário/agente
              OR EXISTS (
                  SELECT 1 FROM public.conversations c2
                  WHERE c2.tenant_id  = c.tenant_id
                    AND c2.agent_id   = c.agent_id
                    AND c2.user_identifier = c.user_identifier
                    AND c2.status IN ('ai_active', 'human_active')
                    AND c2.id != c.id
              )
          )
    ),
    -- Aplica o ROW_NUMBER apenas sobre o subconjunto filtrado
    current_sessions AS (
        SELECT
            id, tenant_id, agent_id, user_identifier, last_message_at, created_at,
            ROW_NUMBER() OVER(PARTITION BY tenant_id, agent_id, user_identifier ORDER BY created_at DESC) as rank
        FROM candidates
    ),
    target_actions AS (
        SELECT
            id,
            (rank = 1 AND (last_message_at < v_cutoff OR last_message_at IS NULL)) as should_notify
        FROM current_sessions
        WHERE
            (rank = 1 AND (last_message_at < v_cutoff OR last_message_at IS NULL))
            OR rank > 1
        LIMIT 1000
    ),
    -- Fechar conversas
    updated_rows AS (
        UPDATE public.conversations c
        SET status          = 'closed',
            last_message_at = COALESCE(c.last_message_at, NOW()),
            updated_at      = NOW()
        FROM target_actions t
        WHERE c.id = t.id
        RETURNING c.id, c.user_identifier, c.agent_id, c.tenant_id, t.should_notify
    ),
    -- Log interno
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
    ),
    -- [FIX 2] Pré-agrega os dados de campanha em 1 scan único
    -- ao invés do LATERAL JOIN que executa 1 query por conversa.
    campaign_data AS (
        SELECT DISTINCT ON (oq.conversation_id)
            oq.conversation_id,
            c.reengagement_template_id,
            c.metadata
        FROM public.outbound_queue oq
        JOIN public.campaigns c ON c.id = oq.campaign_id
        WHERE oq.conversation_id IN (SELECT id FROM updated_rows WHERE should_notify = TRUE)
        ORDER BY oq.conversation_id, oq.created_at DESC
    )
    -- Gerar JSON para o n8n
    SELECT jsonb_agg(
        jsonb_build_object(
            'conversation_id',           u.id,
            'phone',                     regexp_replace(u.user_identifier, '\D', '', 'g'),
            'provider',                  COALESCE(a.whatsapp_provider, 'evolution'),
            'agent_id',                  u.agent_id,
            'tenant_id',                 u.tenant_id,
            'send_idle_closure_message', COALESCE(a.send_idle_closure_message, false),
            'idle_closure_message',      a.idle_closure_message,
            'instance',                  a.evolution_instance,
            'evolution_token',           a.evolution_token,
            'meta_api_token',            a.meta_api_token,
            'meta_phone_number_id',      a.meta_phone_number_id,
            'zenvia_api_token',          a.zenvia_api_token,
            'zenvia_channel_id',         a.zenvia_channel_id,
            'template_id',               COALESCE(
                                             cd.reengagement_template_id,
                                             (cd.metadata->>'template_id')::text
                                         )
        )
    ) INTO v_closed_list
    FROM updated_rows u
    JOIN public.agents a ON a.id = u.agent_id
    LEFT JOIN campaign_data cd ON cd.conversation_id = u.id
    WHERE u.should_notify = TRUE;

    RETURN COALESCE(v_closed_list, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_idle_conversations(INT) TO service_role;
