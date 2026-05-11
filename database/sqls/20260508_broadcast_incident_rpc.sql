-- FUNÇÃO PARA DISPARO AUTOMÁTICO DE INCIDENTES
-- Reduz a complexidade do n8n para apenas 1 nó (chamada desta função)

CREATE OR REPLACE FUNCTION public.fn_trigger_incident_broadcast(
    p_incident_id UUID,
    p_tenant_id UUID,
    p_lead_ids UUID[] DEFAULT NULL -- Novo parâmetro opcional
)
RETURNS TABLE (leads_afetados INT) AS $$
DECLARE
    v_incident RECORD;
    v_count INT := 0;
    v_agent_id UUID;
BEGIN
    -- 1. Busca os dados do incidente
    SELECT * INTO v_incident 
    FROM public.system_incidents 
    WHERE id = p_incident_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0;
        RETURN;
    END IF;

    -- 2. Busca um agente padrão para o envio (necessário para a outbound_queue)
    IF v_incident.campaign_id IS NOT NULL THEN
        SELECT agent_id INTO v_agent_id FROM public.campaigns WHERE id = v_incident.campaign_id;
    END IF;

    IF v_agent_id IS NULL THEN
        SELECT id INTO v_agent_id FROM public.agents WHERE tenant_id = p_tenant_id AND status = 'active' LIMIT 1;
    END IF;

    -- 3. Inserção em Massa na Inbound Queue (Fluxo Normal)
    WITH target_leads AS (
        SELECT 
            id as lead_id,
            whatsapp as phone,
            name as contact_name
        FROM public.agent_leads
        WHERE tenant_id = p_tenant_id
          AND whatsapp IS NOT NULL
          -- Filtro de Campanha (apenas se p_lead_ids não for fornecido)
          AND (p_lead_ids IS NOT NULL OR (v_incident.campaign_id IS NULL OR campaign_id = v_incident.campaign_id))
          -- Filtro por Lista de IDs (se fornecida)
          AND (p_lead_ids IS NULL OR id = ANY(p_lead_ids))
          -- Deduplicação
          AND NOT EXISTS (
              SELECT 1 FROM public.messages 
              WHERE tenant_id = p_tenant_id 
                AND metadata->>'incident_id' = p_incident_id::TEXT
                AND (metadata->>'phone' = whatsapp OR sender_name = contact_name) -- Ajuste fino de duplicidade
          )
    )
    INSERT INTO public.inbound_queue (
        tenant_id,
        agent_id,
        payload,
        status,
        priority,
        message_type,
        trace_id
    )
    SELECT 
        p_tenant_id,
        v_agent_id,
        jsonb_build_object(
            'name', contact_name,
            'phone', phone,
            'content', (regexp_split_to_array(v_incident.problem_description, '\s+'))[1], 
            'instance', 'broadcast_engine',
            'platform', 'system',
            'messageType', 'conversation',
            'incident_id', p_incident_id
        ),
        'pending',
        10,
        'conversation',
        'INC-' || encode(gen_random_bytes(4), 'hex')
    FROM target_leads;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
