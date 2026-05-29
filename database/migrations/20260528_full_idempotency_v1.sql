-- ==============================================================================
-- DAVOS NEXUS - IDEMPOTÊNCIA TOTAL (FASE 4) - OUTBOUND E INBOUND
-- Data: 2026-05-28
-- Objetivo: Impedir o duplo disparo de mensagens no n8n causados por retries.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PARTE 1: PROTEÇÃO DO INBOUND (PORTEIRO)
-- Se a Evolution der timeout e reenviar o webhook, a fila de entrada ignora 
-- se já estiver processando ou processado, mantendo a lógica de produção intacta.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_enqueue_inbound_message(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_conversation_id uuid,
    p_external_id text,
    p_payload jsonb,
    p_trace_id text DEFAULT NULL,
    p_message_type text DEFAULT 'conversation',
    p_latency_ms integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_seq int;
BEGIN
    -- Calcula próximo número na sequência se houver conversa
    IF p_conversation_id IS NOT NULL THEN
        SELECT COALESCE(MAX(sequence_number), 0) + 1 
        INTO v_next_seq
        FROM public.inbound_queue
        WHERE conversation_id = p_conversation_id;
    ELSE
        v_next_seq := 1;
    END IF;

    INSERT INTO public.inbound_queue (
        tenant_id, 
        agent_id, 
        conversation_id, 
        external_id, 
        sequence_number, 
        payload, 
        status,
        trace_id,
        gateway_latency_ms,
        message_type
    )
    VALUES (
        p_tenant_id, 
        p_agent_id, 
        p_conversation_id, 
        p_external_id, 
        v_next_seq, 
        p_payload, 
        'pending',
        p_trace_id,
        COALESCE(p_latency_ms, 0),
        COALESCE(p_message_type, 'conversation')
    )
    ON CONFLICT (tenant_id, external_id) 
    DO UPDATE SET 
        status = CASE 
            WHEN inbound_queue.status IN ('done', 'processing', 'assigned', 'failed') THEN inbound_queue.status 
            ELSE 'pending' 
        END,
        trace_id = CASE 
            WHEN inbound_queue.status IN ('done', 'processing', 'assigned', 'failed') THEN inbound_queue.trace_id
            ELSE EXCLUDED.trace_id
        END,
        created_at = CASE 
            WHEN inbound_queue.status IN ('done', 'processing', 'assigned', 'failed') THEN inbound_queue.created_at
            ELSE NOW()
        END,
        message_type = EXCLUDED.message_type, -- Garante que o tipo seja atualizado no reenvio
        payload = EXCLUDED.payload; -- Atualiza payload se Zenvia mandar dados novos
END;
$$;

-- ------------------------------------------------------------------------------
-- PARTE 2: PROTEÇÃO DO OUTBOUND QUEUE (CAMPANHAS)
-- Adiciona idempotency_key e dedup_at para controle exato de tentativas.
-- ------------------------------------------------------------------------------

-- Adiciona a coluna de chave de idempotência
ALTER TABLE public.outbound_queue ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE public.outbound_queue ADD COLUMN IF NOT EXISTS dedup_at TIMESTAMPTZ;

-- Backfill das chaves existentes baseado no padrão campaign:phone:1
UPDATE public.outbound_queue 
SET idempotency_key = campaign_id || ':' || contact_phone || ':1' 
WHERE idempotency_key IS NULL;

-- Garante a unicidade da chave por tenant e campanha
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_idempotency 
ON public.outbound_queue(campaign_id, idempotency_key);


-- ------------------------------------------------------------------------------
-- PARTE 3: ESCUDO DEFINITIVO NA TABELA DE MENSAGENS (O BANCO DE DADOS DECIDE)
-- Alteração da RPC que insere a mensagem final. Mantém o código de produção original
-- e adiciona o parâmetro opcional p_idempotency_key.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_outbound_sent(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_contact_phone text,
    p_contact_name text,
    p_message_content text,
    p_queue_id uuid DEFAULT NULL,
    p_campaign_id uuid DEFAULT NULL,
    p_message_type text DEFAULT 'text',
    p_remote_id text DEFAULT NULL,
    p_channel public.conversation_channel DEFAULT 'whatsapp'::public.conversation_channel,
    p_trace_id text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL -- NOVO PARÂMETRO OPCIONAL (Não quebra compatibilidade)
) RETURNS jsonb AS $$
DECLARE
    v_conversation_id uuid;
    v_message_id uuid;
    v_clean_phone text;
    v_final_content text; -- [FIX] fallback para campanhas template
BEGIN
    -- [0] Limpeza do telefone
    v_clean_phone := regexp_replace(p_contact_phone, '\D', '', 'g');

    -- [FIX] Se conteúdo vazio (template Zenvia), usa initial_message da campanha
    IF p_message_content IS NULL OR trim(p_message_content) = '' THEN
        SELECT initial_message INTO v_final_content
        FROM public.campaigns
        WHERE id = p_campaign_id;
        v_final_content := COALESCE(v_final_content, '[Mensagem de campanha enviada via template]');
    ELSE
        v_final_content := p_message_content;
    END IF;

    -- [1] Upsert Conversa (Garante que a conversa existe e está ativa)
    INSERT INTO public.conversations (
        tenant_id, 
        agent_id, 
        user_identifier, 
        user_name, 
        channel, 
        status, 
        last_message_at
    )
    VALUES (
        p_tenant_id, 
        p_agent_id, 
        v_clean_phone, 
        p_contact_name, 
        COALESCE(p_channel, 'whatsapp'::public.conversation_channel), 
        'ai_active', 
        NOW()
    )
    ON CONFLICT (tenant_id, agent_id, user_identifier) 
    DO UPDATE SET 
        status = 'ai_active', 
        last_message_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_conversation_id;

    -- Resolve a chave de idempotência (Fallback para trace_id gerado se não enviado pelo n8n)
    IF p_idempotency_key IS NULL THEN
        p_idempotency_key := COALESCE(p_trace_id, extensions.uuid_generate_v4()::text);
    END IF;

    -- [2] Registro da Mensagem (Histórico) com trava de Idempotência
    INSERT INTO public.messages (
        tenant_id, 
        conversation_id, 
        content, 
        direction, 
        message_type, 
        sender_type, 
        remote_id, 
        trace_id,
        external_id, -- Usado para Idempotência Outbound
        metadata
    )
    VALUES (
        p_tenant_id, 
        v_conversation_id, 
        v_final_content,
        'outbound', 
        p_message_type, 
        'agent', 
        p_remote_id, 
        p_trace_id,
        p_idempotency_key,
        jsonb_build_object('campaign_id', p_campaign_id, 'queue_id', p_queue_id)
    )
    ON CONFLICT (tenant_id, external_id) DO NOTHING
    RETURNING id INTO v_message_id;

    -- [2.1] Se bateu na trava de Idempotência (ON CONFLICT disparado)
    IF v_message_id IS NULL THEN
        IF p_queue_id IS NOT NULL THEN
            UPDATE public.outbound_queue 
            SET status = 'deduplicated', dedup_at = NOW() 
            WHERE id = p_queue_id AND tenant_id = p_tenant_id;
        END IF;

        RETURN jsonb_build_object(
            'success', true, 
            'duplicate', true, 
            'message', 'Duplo disparo contido com sucesso pela trava de idempotência.'
        );
    END IF;

    -- [3] Atualização da Fila (outbound_queue)
    IF p_queue_id IS NOT NULL THEN
        UPDATE public.outbound_queue 
        SET status = 'sent', 
            sent_at = NOW(),
            conversation_id = v_conversation_id,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('message_id', v_message_id) 
        WHERE id = p_queue_id AND tenant_id = p_tenant_id;
    END IF;

    -- [4] Sincronização de Estatísticas da Campanha
    IF p_campaign_id IS NOT NULL THEN
        PERFORM public.fn_sync_campaign_stats(p_campaign_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'duplicate', false,
        'conversation_id', v_conversation_id, 
        'message_id', v_message_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
