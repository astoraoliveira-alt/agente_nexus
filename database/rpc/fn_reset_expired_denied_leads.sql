-- ==============================================================================
-- RPC: fn_reset_expired_denied_leads
-- Descrição:
--   Localiza leads cuja análise de crédito na Fiserv foi negada/recusada há mais de X dias
--   (padrão: 30 dias, respeitando a janela de cache da Fiserv).
--   Limpa as flags de recusa do metadata de agent_leads e do context_state da conversa ativa,
--   preservando o histórico anterior em 'fiserv_last_denied_history'.
--   Retorna a lista completa dos leads liberados em formato JSONB para o n8n.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_reset_expired_denied_leads(
    p_tenant_id UUID DEFAULT NULL,
    p_days_threshold INT DEFAULT 30,
    p_limit INT DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH target_leads AS (
        SELECT 
            al.id AS lead_id,
            al.tenant_id,
            al.campaign_id,
            al.identifier,
            al.name,
            al.whatsapp,
            al.metadata,
            -- Extrai a data da recusa (tenta fiserv_last_audit_at, lost_at, fiserv_requested_at ou created_at)
            COALESCE(
                (al.metadata->>'fiserv_last_audit_at')::timestamptz,
                (al.metadata->>'lost_at')::timestamptz,
                (al.metadata->>'fiserv_requested_at')::timestamptz,
                al.created_at
            ) AS denied_at
        FROM public.agent_leads al
        WHERE 
            (p_tenant_id IS NULL OR al.tenant_id = p_tenant_id)
            AND (
                -- Status de recusa ou cancelamento registrado no metadados
                lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled')
                OR lower(COALESCE(al.metadata->>'formalization_status', '')) = 'lost'
                OR lower(COALESCE(al.metadata->>'fiserv_last_status', '')) = 'denied'
                OR lower(COALESCE(al.metadata->>'lost_reason', '')) ILIKE '%políticas internas de crédito%'
            )
            AND (
                COALESCE(
                    (al.metadata->>'fiserv_last_audit_at')::timestamptz,
                    (al.metadata->>'lost_at')::timestamptz,
                    (al.metadata->>'fiserv_requested_at')::timestamptz,
                    al.created_at
                ) < (NOW() - (p_days_threshold || ' days')::INTERVAL)
            )
        ORDER BY denied_at ASC
        LIMIT p_limit
    ),
    updated_leads AS (
        UPDATE public.agent_leads al
        SET 
            metadata = (
                al.metadata 
                - 'fiserv_status'
                - 'fiserv_external_status'
                - 'fiserv_denied_reason'
                - 'fiserv_last_status'
                - 'lost_at'
                - 'lost_reason'
                - 'formalization_status'
            ) || jsonb_build_object(
                'fiserv_eligible_for_resimulation', true,
                'fiserv_unlocked_at', NOW(),
                'fiserv_previous_denied_history', jsonb_build_object(
                    'denied_at', tl.denied_at,
                    'denied_reason', tl.metadata->>'fiserv_denied_reason',
                    'loan_request_id', COALESCE(tl.metadata->>'fiserv_loan_request_id', tl.metadata->>'loan_request_id'),
                    'unlocked_reason', 'cache_interval_30_days_expired'
                )
            )
        FROM target_leads tl
        WHERE al.id = tl.lead_id
        RETURNING 
            al.id AS lead_id,
            al.tenant_id,
            al.campaign_id,
            al.identifier AS cnpj,
            al.name,
            al.whatsapp,
            tl.denied_at,
            (NOW()::date - tl.denied_at::date) AS days_since_denial
    ),
    -- Reset defensivo no context_state de conversas ativas vinculadas a esses números
    cleaned_conversations AS (
        UPDATE public.conversations c
        SET 
            context_state = jsonb_set(
                COALESCE(c.context_state, '{}'::jsonb),
                '{current_step}',
                '"start"'::jsonb
            ),
            updated_at = NOW()
        FROM updated_leads ul
        WHERE 
            c.tenant_id = ul.tenant_id
            AND regexp_replace(c.user_identifier, '\D', '', 'g') = regexp_replace(ul.whatsapp, '\D', '', 'g')
            AND c.context_state->>'current_step' = 'recusa_analise'
        RETURNING c.id AS conversation_id
    )
    SELECT jsonb_build_object(
        'success', true,
        'unlocked_count', COUNT(ul.lead_id),
        'days_threshold', p_days_threshold,
        'executed_at', NOW(),
        'leads', COALESCE(jsonb_agg(
            jsonb_build_object(
                'lead_id', ul.lead_id,
                'tenant_id', ul.tenant_id,
                'campaign_id', ul.campaign_id,
                'cnpj', ul.cnpj,
                'name', ul.name,
                'whatsapp', ul.whatsapp,
                'denied_at', ul.denied_at,
                'days_since_denial', ul.days_since_denial
            )
        ), '[]'::jsonb)
    ) INTO v_result
    FROM updated_leads ul;

    RETURN v_result;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.fn_reset_expired_denied_leads(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reset_expired_denied_leads(UUID, INT, INT) TO service_role;
