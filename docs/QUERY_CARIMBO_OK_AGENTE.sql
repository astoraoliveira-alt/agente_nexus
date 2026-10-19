WITH upd_lead AS (
    UPDATE agent_leads
    SET metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
        'simulation_accepted', true,
        'ok_agente', true,
        'simulation_accepted_at', now(),
        'formalization_status', 'waiting_contact',
        'pipeline_stage', 'pending_contact',
        'accepted_proposal', jsonb_strip_nulls(jsonb_build_object(
            'amount', COALESCE(
                NULLIF('{{ $("Roteador de Contexto").first()?.json?.lead_info?.simulation_data?.amount || "" }}', '')::numeric,
                (metadata->'simulation_data'->>'amount')::numeric,
                NULLIF('{{ $("Roteador de Contexto").first()?.json?.lead_info?.requested_amount || "" }}', '')::numeric
            ),
            'installments', COALESCE(
                NULLIF('{{ $("Roteador de Contexto").first()?.json?.lead_info?.simulation_data?.installments || "" }}', '')::numeric,
                (metadata->'simulation_data'->>'installments')::numeric
            ),
            'installment_value', COALESCE(
                NULLIF('{{ $("Roteador de Contexto").first()?.json?.lead_info?.simulation_data?.installment_value || "" }}', '')::numeric,
                (metadata->'simulation_data'->>'installment_value')::numeric
            ),
            'accepted_via', 'whatsapp',
            'channel', 'whatsapp',
            'timestamp', now()
        ))
    ))
    WHERE (
        identifier = NULLIF('{{ $("Roteador de Contexto").first()?.json?.lead_info?.cnpj || "" }}', '')
        OR whatsapp = NULLIF('{{ $("RPC - Acesso Entrada").first()?.json?.payload?.phone || "" }}', '')
        OR RIGHT(regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g'), 11) = RIGHT(regexp_replace(NULLIF('{{ $("RPC - Acesso Entrada").first()?.json?.payload?.phone || "" }}', ''), '\D', '', 'g'), 11)
    )
    AND tenant_id = NULLIF('{{ $("Roteador de Contexto").first()?.json?.handoff_data?.tenant_id || $("RPC - Acesso Entrada").first()?.json?.context?.tenant_id || "" }}', '')::uuid
    RETURNING id
)
UPDATE conversations
SET metadata = metadata || jsonb_build_object('pipeline_stage', 'pending_contact')
WHERE id = NULLIF('{{ $("Roteador de Contexto").first()?.json?.p_conversation_id || $("RPC - Acesso Entrada").first()?.json?.context?.conversation?.id || "" }}', '')::uuid;
