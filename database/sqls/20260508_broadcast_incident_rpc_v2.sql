-- VERSÃO ULTRA-ROBUSTA DO DISPARO
DROP FUNCTION IF EXISTS public.fn_trigger_incident_broadcast(text, text, text[]);
DROP FUNCTION IF EXISTS public.fn_trigger_incident_broadcast(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.fn_trigger_incident_broadcast(
    p_incident_id TEXT,
    p_tenant_id TEXT,
    p_lead_ids TEXT[] DEFAULT NULL
)
RETURNS TABLE (leads_afetados INT) AS $$
DECLARE
    v_incident RECORD;
    v_count INT := 0;
    v_agent_id UUID;
    v_lead_uuids UUID[];
BEGIN
    -- Converte array de texto para UUID se existir
    IF p_lead_ids IS NOT NULL THEN
        v_lead_uuids := p_lead_ids::UUID[];
    END IF;

    -- 1. Busca os dados do incidente
    SELECT * INTO v_incident 
    FROM public.system_incidents 
    WHERE id = p_incident_id::UUID AND tenant_id = p_tenant_id::UUID;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0;
        RETURN;
    END IF;

    -- 2. Busca o agente
    IF v_incident.campaign_id IS NOT NULL THEN
        SELECT agent_id INTO v_agent_id FROM public.campaigns WHERE id = v_incident.campaign_id;
    END IF;

    IF v_agent_id IS NULL THEN
        SELECT id INTO v_agent_id FROM public.agents WHERE tenant_id = p_tenant_id::UUID AND status = 'active' LIMIT 1;
    END IF;

    -- 3. Inserção em Massa
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
        p_tenant_id::UUID,
        v_agent_id,
        jsonb_build_object(
            'name', l.name,
            'phone', l.whatsapp,
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
    FROM public.agent_leads l
    WHERE l.tenant_id = p_tenant_id::UUID
      AND l.whatsapp IS NOT NULL
      -- Filtro de Leads Selecionados (se fornecido) ou por Campanha
      AND (
          (v_lead_uuids IS NOT NULL AND l.id = ANY(v_lead_uuids))
          OR
          (v_lead_uuids IS NULL AND (v_incident.campaign_id IS NULL OR l.campaign_id = v_incident.campaign_id))
      )
      -- Deduplicação Final
      AND NOT EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.tenant_id = p_tenant_id::UUID 
            AND m.metadata->>'incident_id' = p_incident_id
            AND (m.metadata->>'phone' = l.whatsapp OR m.sender_name = l.name)
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
