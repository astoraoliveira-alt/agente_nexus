-- =========================================================================
-- FASE 2: Integrar reply_sent ao record_message
--
-- Regra: partir do corpo ATUAL da função (confirmado no banco em 2026-06-09)
-- e adicionar SOMENTE a marcação de reply_sent = TRUE quando a mensagem
-- registrada for outbound. Nenhuma outra lógica é alterada.
--
-- Assinatura atual (13 params — confirmada no Supabase):
--   record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text)
-- =========================================================================

-- Não dropa a assinatura atual (13 params) — apenas substitui via CREATE OR REPLACE.
-- Os DROPs abaixo limpam versões legadas de assinaturas menores que podem existir.
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text);

CREATE OR REPLACE FUNCTION public.record_message(
    p_conversation_id UUID,
    p_tenant_id       UUID,
    p_content         TEXT    DEFAULT NULL,
    p_sender_type     TEXT    DEFAULT 'user',
    p_sender_name     TEXT    DEFAULT NULL,
    p_message_type    TEXT    DEFAULT 'text',
    p_trace_id        TEXT    DEFAULT NULL,
    p_metadata        JSONB   DEFAULT '{}'::jsonb,
    p_remote_id       TEXT    DEFAULT NULL,
    p_file_url        TEXT    DEFAULT NULL,
    p_transcription   TEXT    DEFAULT NULL,
    p_direction       TEXT    DEFAULT NULL,
    p_external_id     TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_direction     TEXT;
    v_is_outbound   BOOLEAN;
BEGIN
    -- 1. Lógica de direção original (Garante compatibilidade — idêntica ao atual)
    v_direction := COALESCE(p_direction, CASE WHEN p_sender_type = 'user' THEN 'inbound' ELSE 'outbound' END);

    v_is_outbound := (v_direction = 'outbound');

    -- 2. Inserção com Idempotência (idêntica ao atual)
    INSERT INTO public.messages (
        conversation_id, tenant_id, content, sender_type, sender_name,
        message_type, trace_id, metadata, remote_id, external_id, direction
    ) VALUES (
        p_conversation_id, p_tenant_id, public.clean_message_content(p_content),
        p_sender_type, p_sender_name, p_message_type, p_trace_id,
        p_metadata || jsonb_build_object('file_url', p_file_url, 'transcription', p_transcription),
        p_remote_id,
        COALESCE(p_external_id, p_remote_id), -- Fallback de segurança
        v_direction
    )
    ON CONFLICT (tenant_id, external_id) DO NOTHING; -- 🛡️ Bloqueio real de duplicatas

    -- 3. Atualização do Dashboard (idêntica ao atual — mantida)
    UPDATE public.conversations
    SET last_message_at = NOW(),
        updated_at      = NOW()
    WHERE id = p_conversation_id;

    -- 4. Limpeza de fila + 🔥 NOVO: marcar reply_sent quando for resposta do agente
    IF p_trace_id IS NOT NULL OR p_external_id IS NOT NULL THEN
        UPDATE public.inbound_queue
        SET
            status       = 'done',
            processed_at = NOW(),
            -- 🔥 ÚNICO ACRÉSCIMO: marca reply_sent apenas para mensagens outbound
            reply_sent    = CASE WHEN v_is_outbound THEN TRUE  ELSE reply_sent    END,
            reply_sent_at = CASE WHEN v_is_outbound THEN NOW() ELSE reply_sent_at END
        WHERE trace_id    = p_trace_id
           OR external_id = p_trace_id
           OR external_id = p_external_id;
    END IF;

    -- 5. Retorno esperado pelo N8N (idêntico ao atual — 'direction', não alterado)
    RETURN jsonb_build_object('status', 'success', 'direction', v_direction);
END;
$$;

-- Permissões (mantém todas as roles existentes)
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO anon;

-- Verificação
DO $$
BEGIN
  RAISE NOTICE '✅ record_message atualizado com Reply Gap Tracker';
  RAISE NOTICE '   Mudança: UPDATE inbound_queue agora seta reply_sent=TRUE para mensagens outbound';
  RAISE NOTICE '   Tudo mais idêntico ao corpo atual (conversations update, retorno, condição da fila)';
END $$;
