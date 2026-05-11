-- Migração: Conversion Tracking Infrastructure (V66.20 - Dashboard Visibility)
-- Objetivo: Mudar message_type para 'text' para garantir visibilidade na timeline do dashboard.

CREATE OR REPLACE FUNCTION public.log_link_conversion(p_trace_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_tenant_id UUID;
    v_conversation_id UUID;
    v_lead_name TEXT;
    v_target_url TEXT;
    v_queue_id UUID;
    v_agent_id UUID;
BEGIN
    -- Busca o lead (estratégias unificadas para performance)
    SELECT q.id, q.tenant_id, q.conversation_id, q.contact_name, q.agent_id,
           COALESCE(q.metadata->>'cta_link', 'https://fiservcapital.moneymoneyinvest.com.br/ticket/solicite-agora')
    INTO v_queue_id, v_tenant_id, v_conversation_id, v_lead_name, v_agent_id, v_target_url
    FROM public.outbound_queue q
    LEFT JOIN public.messages m ON (m.trace_id = p_trace_id)
    WHERE q.trace_id = p_trace_id 
       OR q.id = (m.metadata->>'queue_id')::uuid 
       OR q.metadata->>'message_id' = m.id::text
       OR q.conversation_id = m.conversation_id
    ORDER BY q.created_at DESC
    LIMIT 1;

    -- Se encontrou o lead, registra a conversão
    IF v_tenant_id IS NOT NULL THEN
        -- Gravamos como 'text' para aparecer no Dashboard
        INSERT INTO public.messages (
            tenant_id, conversation_id, sender_type, sender_name,
            content, message_type, direction, trace_id, status, metadata
        ) VALUES (
            v_tenant_id, v_conversation_id, 'system', 'Nexus Bridge',
            '✅ [CONVERSÃO]: O usuário ' || COALESCE(v_lead_name, 'interessado') || ' clicou no botão e foi redirecionado.', 
            'text', 'outbound', p_trace_id, 'read',
            jsonb_build_object('event_type', 'click_conversion', 'target_url', v_target_url)
        );
        
        -- Atualiza o status na fila
        UPDATE public.outbound_queue 
        SET status = 'delivered',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('converted', true, 'converted_at', NOW())
        WHERE id = v_queue_id;

        -- Força a atualização da conversa para subir no topo (opcional, dependendo da sua estrutura de triggers)
        UPDATE public.conversations 
        SET updated_at = NOW(),
            last_message = '✅ [CONVERSÃO]: Clique no Link'
        WHERE id = v_conversation_id;
    END IF;

    RETURN v_target_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
