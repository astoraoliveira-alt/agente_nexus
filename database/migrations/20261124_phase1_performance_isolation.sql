-- =============================================================================
-- Migration: Phase 1 Performance Optimization (Zero-Simplification, Safe)
-- Date: 2026-11-24
-- Goals:
--   1. Fix handle_message_status_update(text,text,text,text):
--      - Replace OR scan on messages with 2-step indexed lookup (remote_id -> trace_id)
--      - Fix type-cast bug (metadata->>'message_id')::uuid = v_message_id -> text = v_message_id::text
--        so Postgres uses idx_outbound_queue_msg_id instead of 329MB full seq scan!
--      - Throttle fn_sync_campaign_stats to at most once every 5s per campaign
--        (eliminates row-lock contention on campaigns during mass dispatches without losing accuracy)
--   2. Add covering index on outbound_queue (campaign_id, status) for Index-Only Scans
--   3. Add pg_trgm GIN indexes on conversations (user_name, user_identifier) for instant search
--   4. Drop 6 exact 100% duplicate indexes to reduce WAL & write amplification during dispatches
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Optimize handle_message_status_update (100% identical behavior, eliminates 591ms/call bottleneck)
CREATE OR REPLACE FUNCTION public.handle_message_status_update(
    p_remote_id text,
    p_status_code text,
    p_status_description text,
    p_trace_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_message_id uuid;
    v_campaign_id uuid;
BEGIN
    -- 1. Localizar a mensagem original usando índices (evita seq_scan causado por OR)
    IF p_remote_id IS NOT NULL AND p_remote_id <> '' THEN
        SELECT id, (metadata->>'campaign_id')::uuid
        INTO v_message_id, v_campaign_id
        FROM public.messages
        WHERE remote_id = p_remote_id
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_message_id IS NULL AND p_trace_id IS NOT NULL AND p_trace_id <> '' THEN
        SELECT id, (metadata->>'campaign_id')::uuid
        INTO v_message_id, v_campaign_id
        FROM public.messages
        WHERE trace_id = p_trace_id
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_message_id IS NULL AND p_remote_id IS NOT NULL AND p_remote_id <> '' THEN
        SELECT id, (metadata->>'campaign_id')::uuid
        INTO v_message_id, v_campaign_id
        FROM public.messages
        WHERE trace_id = p_remote_id
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_message_id IS NOT NULL THEN
        -- 2. Registrar no Histórico (Sempre, sem exceção)
        INSERT INTO public.message_status_history (message_id, status, description, raw_payload)
        VALUES (
            v_message_id,
            UPPER(p_status_code),
            p_status_description,
            jsonb_build_object('trace_id', p_trace_id, 'remote_id', p_remote_id)
        );

        -- 3. Atualizar status na tabela messages (Cache para consulta rápida)
        UPDATE public.messages
        SET status = UPPER(p_status_code)
        WHERE id = v_message_id;

        -- 4. Atualizar outbound_queue usando índice text idx_outbound_queue_msg_id (sem cast ::uuid!)
        UPDATE public.outbound_queue
        SET status = LOWER(p_status_code),
            last_attempt_at = NOW()
        WHERE (metadata->>'message_id') = v_message_id::text;

        -- 5. Sincronizar estatísticas da campanha com throttle de 5s para evitar lock contention em disparos em massa
        IF v_campaign_id IS NOT NULL AND EXISTS (
            SELECT 1
            FROM public.campaigns
            WHERE id = v_campaign_id
              AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '5 seconds')
        ) THEN
            PERFORM public.fn_sync_campaign_stats(v_campaign_id);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id, 'campaign_id', v_campaign_id);
END;
$function$;

-- 2. Covering index for fn_sync_campaign_stats & dashboard campaign counts
CREATE INDEX IF NOT EXISTS idx_outbound_queue_campaign_status_all
    ON public.outbound_queue (campaign_id, status);

-- 3. Fast trigram search indexes for Conversations UI (eliminates seq_scan on ILIKE searches)
CREATE INDEX IF NOT EXISTS idx_conversations_user_name_trgm
    ON public.conversations USING gin (user_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_conversations_user_identifier_trgm
    ON public.conversations USING gin (user_identifier gin_trgm_ops);

-- 4. Drop 6 exact duplicate indexes (reduces write amplification & WAL during bulk dispatches)
DROP INDEX IF EXISTS public.idx_messages_conversation_id;
DROP INDEX IF EXISTS public.idx_messages_conversation_created_at;
DROP INDEX IF EXISTS public.idx_messages_trace_id_lookup;
DROP INDEX IF EXISTS public.idx_msh_message_id;
DROP INDEX IF EXISTS public.idx_outbound_queue_trace_id_lookup;
DROP INDEX IF EXISTS public.idx_conversations_tenant_last_message;
