-- ======================================================== --
-- DAVOS NEXUS - HANDLER DE ENVIO DE CAMPANHA (V50.12)     --
-- Garante que a mensagem inicial seja salva na tabela     --
-- public.messages para que a IA tenha contexto.           --
-- ======================================================== --

CREATE OR REPLACE FUNCTION public.handle_outbound_sent(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_contact_phone text,
    p_contact_name text,
    p_message_content text,
    p_queue_id uuid DEFAULT NULL,
    p_campaign_id uuid DEFAULT NULL,
    p_message_type text DEFAULT 'text',
    p_remote_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id uuid;
    v_phone_clean text;
    v_user_identifier text;
BEGIN
    -- [1] Normalização do Identificador
    -- Se tiver remote_id (JID completo), usa ele. Caso contrário, usa o telefone.
    v_phone_clean := regexp_replace(p_contact_phone, '\D', '', 'g');
    v_user_identifier := COALESCE(p_remote_id, v_phone_clean || '@s.whatsapp.net');

    -- [2] Busca ou Cria a Conversa (Atomic Upsert Aware)
    INSERT INTO public.conversations (
        tenant_id, agent_id, user_identifier, status, updated_at
    )
    VALUES (
        p_tenant_id, p_agent_id, v_user_identifier, 'ai_active', NOW()
    )
    ON CONFLICT (tenant_id, agent_id, user_identifier) 
    DO UPDATE SET 
        status = 'ai_active',
        updated_at = NOW()
    RETURNING id INTO v_conversation_id;

    -- [3] SALVA A MENSAGEM NO HISTÓRICO (Vital para a IA Lia!)
    INSERT INTO public.messages (
        tenant_id, conversation_id, sender_type, content, sender_name
    )
    VALUES (
        p_tenant_id, v_conversation_id, 'campaign', p_message_content, 'LIA (Campanha)'
    );

    -- [4] Atualiza o Status na Fila de Saída (Outbound Queue)
    IF p_queue_id IS NOT NULL THEN
        UPDATE public.outbound_queue
        SET 
            status = 'sent',
            sent_at = NOW(),
            conversation_id = v_conversation_id
        WHERE id = p_queue_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'message', 'Campaign message recorded successfully'
    );
END;
$$;
