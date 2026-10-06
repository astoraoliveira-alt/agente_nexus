-- DAVOS NEXUS - FIX: Inbound Media Recovery in record_message
-- Descrição: Recupera automaticamente mediaUrl e messageType da inbound_queue quando
--            mensagens de mídia do cliente (áudio, foto, documento) são registradas pelo n8n
--            sem os parâmetros de arquivo preenchidos, evitando mensagens vazias (tarja preta).
-- Data: 2026-10-06

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
    v_direction      TEXT;
    v_is_outbound    BOOLEAN;
    v_content        TEXT := p_content;
    v_message_type   TEXT := COALESCE(p_message_type, 'text');
    v_file_url       TEXT := p_file_url;
    v_audio_url      TEXT := NULL;
    v_image_url      TEXT := NULL;
    v_queue_media    RECORD;
BEGIN
    -- 1. Lógica de direção original
    v_direction := COALESCE(p_direction, CASE WHEN p_sender_type = 'user' THEN 'inbound' ELSE 'outbound' END);
    v_is_outbound := (v_direction = 'outbound');

    -- 2. 🛡️ AUTO-RECUPERAÇÃO DE MÍDIA INBOUND (Zenvia / Evolution / Meta)
    -- Se for mensagem do cliente e não veio URL de arquivo ou veio tipo 'text', consulta a inbound_queue
    IF p_sender_type = 'user' AND (v_file_url IS NULL OR v_message_type = 'text') THEN
        SELECT 
            q.payload->>'mediaUrl' AS media_url,
            COALESCE(q.payload->>'messageType', q.message_type) AS msg_type
        INTO v_queue_media
        FROM public.inbound_queue q
        WHERE (q.external_id = COALESCE(p_external_id, p_remote_id) OR q.trace_id = p_trace_id)
          AND q.payload->>'mediaUrl' IS NOT NULL
        ORDER BY q.created_at DESC
        LIMIT 1;

        IF v_queue_media.media_url IS NOT NULL THEN
            v_file_url := v_queue_media.media_url;
            v_message_type := COALESCE(v_queue_media.msg_type, 'document');

            -- Detecção de áudio Zenvia (.bin, .oga, .ogg)
            IF v_message_type = 'document' AND (
                v_file_url ILIKE '%.bin' OR 
                v_file_url ILIKE '%.oga' OR 
                v_file_url ILIKE '%.ogg' OR 
                v_file_url ILIKE '%.mp3'
            ) THEN
                v_message_type := 'audio';
            END IF;

            -- Se o conteúdo textual veio em branco, adiciona rótulo legível
            IF v_content IS NULL OR trim(v_content) = '' THEN
                v_content := CASE 
                    WHEN v_message_type = 'audio' THEN '[Áudio recebido]'
                    WHEN v_message_type = 'image' THEN '[Imagem recebida]'
                    ELSE '[Documento recebido]'
                END;
            END IF;
        END IF;
    END IF;

    -- Define URLs específicas por tipo
    IF v_message_type = 'audio' THEN
        v_audio_url := v_file_url;
    ELSIF v_message_type = 'image' THEN
        v_image_url := v_file_url;
    END IF;

    -- 3. Inserção com Idempotência
    INSERT INTO public.messages (
        conversation_id, tenant_id, content, sender_type, sender_name,
        message_type, audio_url, image_url, trace_id, metadata, 
        remote_id, external_id, direction
    ) VALUES (
        p_conversation_id, p_tenant_id, public.clean_message_content(v_content),
        p_sender_type, p_sender_name, v_message_type, v_audio_url, v_image_url, p_trace_id,
        p_metadata || jsonb_build_object('file_url', v_file_url, 'transcription', p_transcription),
        p_remote_id,
        COALESCE(p_external_id, p_remote_id),
        v_direction
    )
    ON CONFLICT (tenant_id, external_id) DO NOTHING;

    -- 4. Atualização da Conversa
    UPDATE public.conversations
    SET last_message_at = NOW(),
        updated_at      = NOW()
    WHERE id = p_conversation_id;

    -- 5. Limpeza de fila + marca reply_sent quando for resposta do agente
    IF p_trace_id IS NOT NULL OR p_external_id IS NOT NULL THEN
        UPDATE public.inbound_queue
        SET
            status       = 'done',
            processed_at = NOW(),
            reply_sent    = CASE WHEN v_is_outbound THEN TRUE  ELSE reply_sent    END,
            reply_sent_at = CASE WHEN v_is_outbound THEN NOW() ELSE reply_sent_at END
        WHERE trace_id    = p_trace_id
           OR external_id = p_trace_id
           OR external_id = p_external_id;
    END IF;

    -- 6. Retorno esperado pelo N8N
    RETURN jsonb_build_object('status', 'success', 'direction', v_direction);
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO anon;
