-- Function to atomically handle successful outbound messages triggers by N8N
-- Creates/Updates Contact -> Gets/Creates Conversation -> Logs Message -> Updates Queue
-- Ensures data integrity and consistent state without "AI guessing"
-- Returns detailed summary of actions taken and captures errors gracefully.

CREATE OR REPLACE FUNCTION public.handle_outbound_sent(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_contact_phone text,
    p_contact_name text,
    p_message_content text,
    p_queue_id uuid,
    p_campaign_id uuid,
    p_message_type text DEFAULT 'text',
    p_remote_id text DEFAULT NULL,
    p_channel public.conversation_channel DEFAULT 'whatsapp'::public.conversation_channel,
    p_trace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone text;
    v_conversation_id uuid;
    v_message_id uuid;
    v_contact_id uuid;
BEGIN
    -- [0] VALIDAÇÃO INICIAL
    IF p_tenant_id IS NULL OR p_agent_id IS NULL OR p_contact_phone IS NULL THEN
        RAISE EXCEPTION 'tenant_id, agent_id e contact_phone são obrigatórios';
    END IF;

    -- [1] LIMPEZA NUCLEAR DO IDENTIFICADOR (Digits Only Rule)
    -- Remove '@s.whatsapp.net', '@lid', caracteres especiais, etc. e mantém apenas números
    v_clean_phone := regexp_replace(p_contact_phone, '\D', '', 'g');
    
    -- Se o telefone for vazio após limpeza (ex: só tinha letras), erro
    IF v_clean_phone = '' THEN
        RAISE EXCEPTION 'Telefone inválido (sem dígitos) para o lead %', p_queue_id;
    END IF;

    -- [2] UPSERT DE CONTATO (Garante que o contato exista e esteja no tenant)
    INSERT INTO public.contacts (
        identifier,
        name,
        tenant_id,
        metadata
    )
    VALUES (
        v_clean_phone,
        p_contact_name,
        p_tenant_id,
        jsonb_build_object('source', 'campaign', 'campaign_id', p_campaign_id)
    )
    ON CONFLICT (identifier, tenant_id) 
    DO UPDATE SET 
        name = EXCLUDED.name,
        updated_at = NOW()
    RETURNING id INTO v_contact_id;

    -- [3] UPSERT DE CONVERSA (Abre ou vincula a conversa ao Agente correto)
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
        last_message_at = NOW(),
        status = 'ai_active',
        updated_at = NOW()
    RETURNING id INTO v_conversation_id;

    -- [4] REGISTRO DA MENSAGEM (Persistência histórica para visibilidade no Dashboard)
    INSERT INTO public.messages (
        tenant_id,
        conversation_id,
        content,
        direction,
        message_type,
        sender_type,
        remote_id,
        metadata
    )
    VALUES (
        p_tenant_id,
        v_conversation_id,
        p_message_content,
        'outbound',
        p_message_type,
        'agent',
        p_remote_id,
        jsonb_build_object(
            'campaign_id', p_campaign_id, 
            'queue_id', p_queue_id,
            'trace_id', COALESCE(p_trace_id, p_queue_id)
        )
    )
    RETURNING id INTO v_message_id;

        -- [5] STATUS DA FILA (Marca como enviado)
        IF p_queue_id IS NOT NULL THEN
            UPDATE public.outbound_queue
            SET 
                status = 'sent',
                sent_at = NOW(),
                conversation_id = v_conversation_id,
                metadata = metadata || jsonb_build_object('message_id', v_message_id)
            WHERE id = p_queue_id;
        END IF;

        -- [6] REGISTRO DE FILA DE ENTRADA (Controle Centralizado solicitado pelo usuário)
        -- Cria um registro na inbound_queue com o ID do provedor para rastreio unificado
        PERFORM public.fn_enqueue_inbound_message(
            p_tenant_id,
            p_agent_id,
            v_conversation_id,
            p_remote_id, -- ID da Zenvia
            jsonb_build_object(
                'type', 'outbound_status',
                'status', 'sent',
                'queue_id', p_queue_id,
                'campaign_id', p_campaign_id,
                'message_id', v_message_id,
                'phone', v_clean_phone
            ),
            p_trace_id::varchar,
            'outbound_sent'
        );

    -- [6] RETORNO ATÔMICO
    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'message_id', v_message_id,
        'contact_id', v_contact_id,
        'identifier', v_clean_phone
    );

EXCEPTION WHEN OTHERS THEN
    -- [EXTRA] Se der erro, tenta ao menos marcar como falha na fila para não travar em processing
    IF p_queue_id IS NOT NULL THEN
        UPDATE public.outbound_queue
        SET 
            status = 'failed',
            error_message = SQLERRM,
            updated_at = NOW()
        WHERE id = p_queue_id;
    END IF;

    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', 'Erro ao processar handle_outbound_sent para o número ' || p_contact_phone
    );
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.handle_outbound_sent(uuid, uuid, text, text, text, uuid, uuid, text, text, public.conversation_channel, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_outbound_sent(uuid, uuid, text, text, text, uuid, uuid, text, text, public.conversation_channel, uuid) TO service_role;
