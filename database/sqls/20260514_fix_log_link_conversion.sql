-- 20260514_fix_log_link_conversion.sql
-- Fix: O p_trace_id recebido é o JWT token do link (/v1/l/JWT).
-- O RPC precisa buscar em agent_leads pela URL que contém esse JWT
-- e retornar o cta_link completo (com ?t=JWT&c=2) para o redirect.

CREATE OR REPLACE FUNCTION public.log_link_conversion(p_trace_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_tenant_id       UUID;
    v_conversation_id UUID;
    v_lead_name       TEXT;
    v_target_url      TEXT;
    v_queue_id        UUID;
    v_agent_id        UUID;
BEGIN
    -- [1] Busca o lead em agent_leads pelo JWT token embutido no cta_link
    --     O cta_link é armazenado como: https://...?t=JWT&c=2
    --     O p_trace_id é o JWT (só o token, sem base URL)
    SELECT
        al.cta_link,
        al.tenant_id,
        oq.id,
        oq.conversation_id,
        oq.contact_name,
        oq.agent_id
    INTO v_target_url, v_tenant_id, v_queue_id, v_conversation_id, v_lead_name, v_agent_id
    FROM public.agent_leads al
    LEFT JOIN public.outbound_queue oq
           ON oq.contact_phone = al.whatsapp
          AND oq.campaign_id   = al.campaign_id
    WHERE al.cta_link LIKE '%' || p_trace_id || '%'
    ORDER BY oq.created_at DESC
    LIMIT 1;

    -- [2] Se não achou em agent_leads, tenta o trace_id antigo (legado)
    IF v_tenant_id IS NULL THEN
        SELECT q.id, q.tenant_id, q.conversation_id, q.contact_name, q.agent_id,
               COALESCE(q.metadata->>'cta_link', NULL)
        INTO v_queue_id, v_tenant_id, v_conversation_id, v_lead_name, v_agent_id, v_target_url
        FROM public.outbound_queue q
        WHERE q.trace_id = p_trace_id
        ORDER BY q.created_at DESC
        LIMIT 1;
    END IF;

    -- [3] Se encontrou o lead mas conversation_id está NULL, tenta via telefone
    IF v_tenant_id IS NOT NULL AND v_conversation_id IS NULL AND v_agent_id IS NOT NULL THEN
        SELECT c.id INTO v_conversation_id
        FROM public.conversations c
        JOIN public.agent_leads al2 ON al2.whatsapp = c.user_identifier
        WHERE al2.cta_link LIKE '%' || p_trace_id || '%'
          AND c.agent_id = v_agent_id
        ORDER BY c.last_message_at DESC
        LIMIT 1;
    END IF;

    -- [4] Se encontrou o lead, registra a conversão e redireciona
    IF v_tenant_id IS NOT NULL AND v_target_url IS NOT NULL AND v_conversation_id IS NOT NULL THEN
        -- Registra o clique como mensagem na timeline do dashboard
        INSERT INTO public.messages (
            tenant_id, conversation_id, sender_type, sender_name,
            content, message_type, direction, trace_id, status, metadata
        ) VALUES (
            v_tenant_id, v_conversation_id, 'system', 'Nexus Bridge',
            '✅ [CONVERSÃO]: O usuário ' || COALESCE(v_lead_name, 'interessado') || ' clicou no botão e foi redirecionado.',
            'text', 'outbound', p_trace_id, 'read',
            jsonb_build_object('event_type', 'click_conversion', 'target_url', v_target_url)
        )
        ON CONFLICT DO NOTHING;

        -- Atualiza status da fila
        IF v_queue_id IS NOT NULL THEN
            UPDATE public.outbound_queue
            SET status   = 'converted',
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'converted', true,
                    'converted_at', NOW()
                )
            WHERE id = v_queue_id;
        END IF;

        -- Atualiza conversa (sobe para o topo do dashboard)
        UPDATE public.conversations
        SET updated_at      = NOW(),
            last_message_at = NOW()
        WHERE id = v_conversation_id;
    END IF;

    -- [4] Retorna a URL completa do lead OU fallback genérico
    RETURN COALESCE(
        v_target_url,
        'https://fiservcapital.moneymoneyinvest.com.br/ticket/solicite-agora'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
