-- =============================================
-- Migration: 20260610_fix_close_idle_timeout.sql
-- Purpose: Resolve statement timeout em close_idle_conversations.
--
-- ROOT CAUSE: O LATERAL JOIN em outbound_queue fazia um index scan
--   completo para cada conversa processada (N queries dentro do loop).
--   Sem o índice (conversation_id, created_at DESC), isso virava um
--   full table scan multiplicado por 1000 → timeout garantido com backlog.
--
-- FIX REAL: Os 2 índices abaixo. O SET LOCAL é rede de segurança.
--   Com os índices, 1000 linhas rodará em poucos segundos.
--   Limit mantido em 1000 para não atrasar a limpeza do backlog.
--   A cron de 15min em steady state processa apenas ~dezenas por ciclo.
--
-- LÓGICA PRESERVADA 100%:
--   • ROW_NUMBER, should_notify, rank > 1 (duplicatas), inserted_logs
--   • LATERAL JOIN para template da campanha
-- =============================================

-- 1. Índice de suporte para o LATERAL JOIN (se ainda não existe)
CREATE INDEX IF NOT EXISTS idx_outbound_queue_conv_created_desc
    ON public.outbound_queue (conversation_id, created_at DESC)
    WHERE conversation_id IS NOT NULL;

-- 2. Índice para acelerar a busca de conversas ociosas ativas
CREATE INDEX IF NOT EXISTS idx_conversations_active_last_msg
    ON public.conversations (status, last_message_at)
    WHERE status IN ('ai_active', 'human_active');

-- 3. Função otimizada
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
    -- Proteção: nunca ultrapassar o timeout do Supabase (30s)
    SET LOCAL statement_timeout = '25s';

    v_cutoff := NOW() - (p_idle_minutes || ' minutes')::interval;

    -- 1. Selecionar e fechar conversas em batch de 200
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
        -- Limit mantido em 1000: os índices acima garantem performance.
        -- SET LOCAL statement_timeout é rede de segurança, não a solução.
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
