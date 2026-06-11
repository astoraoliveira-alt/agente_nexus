-- =========================================================================
-- PERFORMANCE OPTIMIZATION: N8N MASSIVE SENDING FLOW
-- =========================================================================

-- 1. Criação de Índices Cirúrgicos para acelerar a subquery N+1 no `get_next_leads_secure`
CREATE INDEX IF NOT EXISTS idx_contact_pressure_logs_tenant_phone_date 
ON public.contact_pressure_logs(tenant_id, contact_phone, sent_at);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
ON public.messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_outbound_queue_collision 
ON public.outbound_queue(tenant_id, contact_phone, status);

CREATE INDEX IF NOT EXISTS idx_outbound_queue_campaign_status_pending
ON public.outbound_queue(campaign_id, status)
WHERE status = 'pending';


-- 2. Atualização da função `handle_outbound_sent` (Remoção do Efeito Cascata de Estatísticas)
-- Limpa a assinatura incorreta que foi criada na primeira versão deste script (se houver)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'handle_outbound_sent' AND pronamespace = 'public'::regnamespace) 
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
    END LOOP;
END $$;

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
    p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id uuid;
    v_message_id uuid;
    v_clean_phone text;
    v_final_content text;
    v_reengagement_loop text;
BEGIN
    -- [0] Limpeza do telefone
    v_clean_phone := regexp_replace(p_contact_phone, '\D', '', 'g');

    -- Verificar se é um reengajamento a partir da fila
    IF p_queue_id IS NOT NULL THEN
        SELECT metadata->>'reengagement_loop' INTO v_reengagement_loop
        FROM public.outbound_queue
        WHERE id = p_queue_id;
    END IF;

    -- [FIX] Se conteúdo vazio (template Zenvia), pega a mensagem da campanha
    IF p_message_content IS NULL OR trim(p_message_content) = '' THEN
        IF v_reengagement_loop IS NOT NULL THEN
            SELECT reengagement_message INTO v_final_content FROM public.campaigns WHERE id = p_campaign_id;
            v_final_content := COALESCE(v_final_content, '[Template de Reengajamento Enviado]');
        ELSE
            SELECT initial_message INTO v_final_content FROM public.campaigns WHERE id = p_campaign_id;
            v_final_content := COALESCE(v_final_content, '[Mensagem de campanha enviada via template]');
        END IF;
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

    -- [2] Registro da Mensagem (Histórico)
    INSERT INTO public.messages (
        tenant_id, 
        conversation_id, 
        content, 
        direction, 
        message_type, 
        sender_type, 
        remote_id, 
        trace_id,
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
        jsonb_build_object('campaign_id', p_campaign_id, 'queue_id', p_queue_id)
    )
    RETURNING id INTO v_message_id;

    -- [3] Atualização da Fila (outbound_queue)
    IF p_queue_id IS NOT NULL THEN
        UPDATE public.outbound_queue 
        SET status = 'sent', 
            sent_at = NOW(),
            conversation_id = v_conversation_id,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('message_id', v_message_id) 
        WHERE id = p_queue_id;
    END IF;

    -- [4] Sincronização de Estatísticas Removida
    -- Motivo Arquitetural: Não deve ser chamada de forma síncrona, a cada envio de mensagem (N8N envia 3000 de uma vez), 
    -- o que causa o efeito cascata de 3000 recalculos da campanha. O Dashboard já foi otimizado para ler on the fly.
    -- O N8N ficará absurdamente mais rápido apenas com essa alteração.

    RETURN jsonb_build_object(
        'success', true, 
        'conversation_id', v_conversation_id, 
        'message_id', v_message_id
    );
END;
$$;
