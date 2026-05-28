-- ============================================================
-- RPC: get_campaign_metrics_v2 e get_all_campaigns_metrics_v2
-- Descrição: Ajusta a heurística do `clicked_button` para 
-- reconhecer palavras curtas e respostas padrão de botões 
-- interativos de WhatsApp (como "Sim", "Pode enviar", etc).
-- ============================================================

DROP FUNCTION IF EXISTS get_campaign_metrics_v2(UUID, UUID);

CREATE OR REPLACE FUNCTION get_campaign_metrics_v2(
  p_campaign_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH leads_base AS (
      SELECT 
        oq.id,
        oq.status,
        oq.sent_at,
        oq.conversation_id,
        oq.response_detected as raw_response,
        oq.metadata,
        c.success_criteria,
        c.success_link_filter
      FROM public.outbound_queue oq
      JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
        AND (p_tenant_id IS NULL OR oq.tenant_id = p_tenant_id)
  ),
  leads_with_status AS (
      SELECT 
        id,
        conversation_id,
        sent_at,
        success_criteria,
        success_link_filter,
        metadata,
        status,
        CASE
          WHEN trim(lower(status)) IN ('converted', 'convertida') THEN 'converted'
          WHEN trim(lower(status)) IN ('read', 'respondida', 'lida', 'recebida', 'interagiu') THEN 'read'
          WHEN trim(lower(status)) IN ('delivered', 'entregue') THEN 'delivered'
          WHEN trim(lower(status)) IN ('sent', 'enviada') THEN 'sent'
          WHEN trim(lower(status)) IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected', 'not_delivered') THEN 'failed'
          ELSE 'queued'
        END as current_status
      FROM leads_base
  ),
  leads_enriched AS (
      SELECT
        lws.*,
        p_campaign_id as campaign_id,
        (
            SELECT EXISTS (
                SELECT 1 FROM public.messages m
                WHERE m.conversation_id = lws.conversation_id
                  AND m.sender_type = 'user'
                  AND m.direction = 'inbound'
                  AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
            )
        ) as has_response,
        -- Heurística EXATA para "Botão Inicial" (Sem interação no chat antes do clique no botão)
        (
            -- Verifica se tem a mensagem exata de conversão por botão
            EXISTS (
                SELECT 1 FROM public.messages m
                WHERE m.conversation_id = lws.conversation_id
                  AND m.content ILIKE '%✅ [CONVERSÃO]: O usuário%clicou no botão e foi redirecionado.%'
                  AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
            )
            -- E garante que não houve NENHUMA mensagem do usuário (interação) ANTES desse clique
            AND NOT EXISTS (
                SELECT 1 FROM public.messages m_user
                WHERE m_user.conversation_id = lws.conversation_id
                  AND m_user.sender_type = 'user'
                  AND (lws.sent_at IS NULL OR m_user.created_at >= lws.sent_at)
                  AND m_user.created_at < (
                      SELECT min(m_conv.created_at) FROM public.messages m_conv
                      WHERE m_conv.conversation_id = lws.conversation_id
                        AND m_conv.content ILIKE '%✅ [CONVERSÃO]: O usuário%clicou no botão e foi redirecionado.%'
                        AND (lws.sent_at IS NULL OR m_conv.created_at >= lws.sent_at)
                  )
            )
        ) as clicked_button,
        (
            CASE 
              WHEN trim(lower(lws.status)) = 'converted' 
                   OR (lws.metadata->>'converted') = 'true' 
                   OR EXISTS (
                       SELECT 1 FROM public.messages m
                       WHERE m.conversation_id = lws.conversation_id
                         AND m.content ILIKE '%[CONVERSÃO]%'
                         AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                   ) THEN TRUE
              WHEN 'CLIENT_RESPONDED' = ANY(lws.success_criteria) THEN
                EXISTS (
                    SELECT 1 FROM public.messages m
                    WHERE m.conversation_id = lws.conversation_id
                      AND m.sender_type = 'user'
                      AND m.direction = 'inbound'
                      AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                )
              WHEN 'LINK_SENT' = ANY(lws.success_criteria) AND COALESCE(lws.success_link_filter, '') <> '' THEN
                EXISTS (
                    SELECT 1 FROM public.messages m
                    WHERE m.conversation_id = lws.conversation_id
                      AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
                      AND m.content ILIKE '%' || lws.success_link_filter || '%'
                      AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                )
              ELSE FALSE
            END
        ) as is_converted
      FROM leads_with_status lws
  ),
  metrics_grouped AS (
      SELECT
        le.campaign_id,
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE current_status NOT IN ('queued', 'pending', 'scheduled', 'draft') OR has_response = TRUE OR is_converted = TRUE) as sent_count,
        COUNT(*) FILTER (WHERE current_status IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as delivered_count,
        COUNT(*) FILTER (WHERE current_status IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as read_count,
        COUNT(*) FILTER (WHERE has_response = TRUE OR is_converted = TRUE) as response_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE) as conversion_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = TRUE) as conversion_button_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = FALSE) as conversion_chat_count,
        COUNT(*) FILTER (WHERE current_status IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected')) as failed_count
      FROM leads_enriched le
      GROUP BY le.campaign_id
  ),
  errors_grouped AS (
      SELECT 
        cil.campaign_id,
        COUNT(*) as import_errors
      FROM public.campaign_import_logs cil
      WHERE cil.tenant_id = p_tenant_id AND p_campaign_id IS NOT NULL AND cil.campaign_id = p_campaign_id
      GROUP BY cil.campaign_id
  )
  SELECT jsonb_build_object(
    'campaign_id', mg.campaign_id,
    'total_contacts', mg.total_contacts,
    'sent_count', mg.sent_count,
    'delivered_count', mg.delivered_count,
    'read_count', mg.read_count,
    'response_count', mg.response_count,
    'conversion_count', mg.conversion_count,
    'conversion_button_count', mg.conversion_button_count,
    'conversion_chat_count', mg.conversion_chat_count,
    'failed_count', mg.failed_count,
    'conversion_rate', CASE 
      WHEN mg.delivered_count > 0 THEN ROUND((mg.conversion_count::NUMERIC / mg.delivered_count::NUMERIC) * 100, 2)
      ELSE 0
    END,
    'import_errors', COALESCE(eg.import_errors, 0),
    'success_criteria_used', (SELECT success_criteria FROM public.campaigns WHERE id = mg.campaign_id)
  )
  INTO v_result
  FROM metrics_grouped mg
  LEFT JOIN errors_grouped eg ON eg.campaign_id = mg.campaign_id;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;


-- ============================================================
-- RPC: get_all_campaigns_metrics_v2
-- ============================================================
DROP FUNCTION IF EXISTS get_all_campaigns_metrics_v2(UUID);

CREATE OR REPLACE FUNCTION get_all_campaigns_metrics_v2(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH leads_base AS (
      SELECT 
        oq.id,
        oq.status,
        oq.sent_at,
        oq.conversation_id,
        oq.response_detected as raw_response,
        oq.metadata,
        c.id as campaign_id,
        c.success_criteria,
        c.success_link_filter
      FROM public.outbound_queue oq
      JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
  ),
  leads_with_status AS (
      SELECT 
        id,
        campaign_id,
        conversation_id,
        sent_at,
        success_criteria,
        success_link_filter,
        metadata,
        status,
        CASE
          WHEN trim(lower(status)) IN ('converted', 'convertida') THEN 'converted'
          WHEN trim(lower(status)) IN ('read', 'respondida', 'lida', 'recebida', 'interagiu') THEN 'read'
          WHEN trim(lower(status)) IN ('delivered', 'entregue') THEN 'delivered'
          WHEN trim(lower(status)) IN ('sent', 'enviada') THEN 'sent'
          WHEN trim(lower(status)) IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected', 'not_delivered') THEN 'failed'
          ELSE 'queued'
        END as current_status
      FROM leads_base
  ),
  leads_enriched AS (
      SELECT
        lws.*,
        (
            SELECT EXISTS (
                SELECT 1 FROM public.messages m
                WHERE m.conversation_id = lws.conversation_id
                  AND m.sender_type = 'user'
                  AND m.direction = 'inbound'
                  AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
            )
        ) as has_response,
        -- Heurística EXATA para "Botão Inicial" (Sem interação no chat antes do clique no botão)
        (
            -- Verifica se tem a mensagem exata de conversão por botão
            EXISTS (
                SELECT 1 FROM public.messages m
                WHERE m.conversation_id = lws.conversation_id
                  AND m.content ILIKE '%✅ [CONVERSÃO]: O usuário%clicou no botão e foi redirecionado.%'
                  AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
            )
            -- E garante que não houve NENHUMA mensagem do usuário (interação) ANTES desse clique
            AND NOT EXISTS (
                SELECT 1 FROM public.messages m_user
                WHERE m_user.conversation_id = lws.conversation_id
                  AND m_user.sender_type = 'user'
                  AND (lws.sent_at IS NULL OR m_user.created_at >= lws.sent_at)
                  AND m_user.created_at < (
                      SELECT min(m_conv.created_at) FROM public.messages m_conv
                      WHERE m_conv.conversation_id = lws.conversation_id
                        AND m_conv.content ILIKE '%✅ [CONVERSÃO]: O usuário%clicou no botão e foi redirecionado.%'
                        AND (lws.sent_at IS NULL OR m_conv.created_at >= lws.sent_at)
                  )
            )
        ) as clicked_button,
        (
            CASE 
              WHEN trim(lower(lws.status)) = 'converted' 
                   OR (lws.metadata->>'converted') = 'true' 
                   OR EXISTS (
                       SELECT 1 FROM public.messages m
                       WHERE m.conversation_id = lws.conversation_id
                         AND m.content ILIKE '%[CONVERSÃO]%'
                         AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                   ) THEN TRUE
              WHEN 'CLIENT_RESPONDED' = ANY(lws.success_criteria) THEN
                EXISTS (
                    SELECT 1 FROM public.messages m
                    WHERE m.conversation_id = lws.conversation_id
                      AND m.sender_type = 'user'
                      AND m.direction = 'inbound'
                      AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                )
              WHEN 'LINK_SENT' = ANY(lws.success_criteria) AND COALESCE(lws.success_link_filter, '') <> '' THEN
                EXISTS (
                    SELECT 1 FROM public.messages m
                    WHERE m.conversation_id = lws.conversation_id
                      AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
                      AND m.content ILIKE '%' || lws.success_link_filter || '%'
                      AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                )
              ELSE FALSE
            END
        ) as is_converted
      FROM leads_with_status lws
  ),
  metrics_grouped AS (
      SELECT
        le.campaign_id,
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE current_status NOT IN ('queued', 'pending', 'scheduled', 'draft') OR has_response = TRUE OR is_converted = TRUE) as sent_count,
        COUNT(*) FILTER (WHERE current_status IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as delivered_count,
        COUNT(*) FILTER (WHERE current_status IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as read_count,
        COUNT(*) FILTER (WHERE has_response = TRUE OR is_converted = TRUE) as response_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE) as conversion_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = TRUE) as conversion_button_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = FALSE) as conversion_chat_count,
        COUNT(*) FILTER (WHERE current_status IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected')) as failed_count
      FROM leads_enriched le
      GROUP BY le.campaign_id
  ),
  errors_grouped AS (
      SELECT 
        cil.campaign_id,
        COUNT(*) as import_errors
      FROM public.campaign_import_logs cil
      WHERE cil.tenant_id = p_tenant_id
      GROUP BY cil.campaign_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'campaign_id', mg.campaign_id,
      'total_contacts', mg.total_contacts,
      'sent_count', mg.sent_count,
      'delivered_count', mg.delivered_count,
      'read_count', mg.read_count,
      'response_count', mg.response_count,
      'conversion_count', mg.conversion_count,
      'conversion_button_count', mg.conversion_button_count,
      'conversion_chat_count', mg.conversion_chat_count,
      'failed_count', mg.failed_count,
      'conversion_rate', CASE 
        WHEN mg.delivered_count > 0 THEN ROUND((mg.conversion_count::NUMERIC / mg.delivered_count::NUMERIC) * 100, 2)
        ELSE 0
      END,
      'import_errors', COALESCE(eg.import_errors, 0),
      'success_criteria_used', (SELECT success_criteria FROM public.campaigns WHERE id = mg.campaign_id)
    )
  )
  INTO v_result
  FROM metrics_grouped mg
  LEFT JOIN errors_grouped eg ON eg.campaign_id = mg.campaign_id;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;
