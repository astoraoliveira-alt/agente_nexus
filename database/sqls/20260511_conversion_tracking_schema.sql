-- Migração: Conversion Tracking Infrastructure (V66.16 - Fail-Proof)
-- Objetivo: Rastreio de cliques com fallback para a tabela de mensagens caso o trace_id na fila esteja null.

-- 1. [PERFORMANCE] Índices
CREATE INDEX IF NOT EXISTS idx_messages_trace_id_lookup ON public.messages (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_queue_trace_id_lookup ON public.outbound_queue (trace_id) WHERE trace_id IS NOT NULL;

-- 2. [TRACKING] RPC de Conversão Robusta
CREATE OR REPLACE FUNCTION public.log_link_conversion(p_trace_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_tenant_id UUID;
    v_conversation_id UUID;
    v_agent_id UUID;
    v_lead_name TEXT;
    v_target_url TEXT;
    v_queue_id UUID;
BEGIN
    -- Estratégia 1: Busca direta na fila (mais rápido)
    SELECT 
        id, tenant_id, conversation_id, contact_name, agent_id,
        COALESCE(metadata->>'cta_link', 'https://fiservcapital.moneymoneyinvest.com.br/ticket/solicite-agora')
    INTO v_queue_id, v_tenant_id, v_conversation_id, v_lead_name, v_agent_id, v_target_url
    FROM public.outbound_queue 
    WHERE trace_id = p_trace_id;

    -- Estratégia 2: Fallback via tabela de mensagens (caso o trace_id na fila esteja null)
    IF v_tenant_id IS NULL THEN
        SELECT 
            m.tenant_id, 
            m.conversation_id, 
            m.agent_id, 
            q.contact_name, 
            q.id,
            COALESCE(q.metadata->>'cta_link', 'https://fiservcapital.moneymoneyinvest.com.br/ticket/solicite-agora')
        INTO v_tenant_id, v_conversation_id, v_agent_id, v_lead_name, v_queue_id, v_target_url
        FROM public.messages m
        JOIN public.outbound_queue q ON q.id = (m.metadata->>'queue_id')::uuid
        WHERE m.trace_id = p_trace_id
        LIMIT 1;
    END IF;

    -- Se encontrou o lead (por qualquer via), registra a conversão
    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.messages (
            tenant_id, conversation_id, sender_type, sender_name,
            agent_id, content, message_type, direction, trace_id, status, metadata
        ) VALUES (
            v_tenant_id, v_conversation_id, 'system', 'Nexus Bridge',
            v_agent_id, '✅ [CONVERSÃO]: O usuário ' || COALESCE(v_lead_name, 'interessado') || ' clicou no botão e foi redirecionado.', 
            'event', 'outbound', p_trace_id, 'read',
            jsonb_build_object('event_type', 'click_conversion', 'target_url', v_target_url)
        );
        
        -- Atualiza a fila original
        UPDATE public.outbound_queue 
        SET status = 'delivered',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('converted', true, 'converted_at', NOW())
        WHERE id = v_queue_id;
    END IF;

    RETURN v_target_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
