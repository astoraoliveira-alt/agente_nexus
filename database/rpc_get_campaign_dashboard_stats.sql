-- ============================================================
-- RPC: get_campaign_dashboard_stats_v2 (Suporte a Visão Global)
-- ============================================================

CREATE OR REPLACE FUNCTION get_campaign_dashboard_stats(p_campaign_id UUID DEFAULT NULL, p_tenant_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_total_contacts BIGINT := 0;
  v_import_errors BIGINT := 0;
  v_sent_count BIGINT := 0;
  v_response_count BIGINT := 0;
  v_conversion_count BIGINT := 0;
  v_success_criteria TEXT[];
  v_link_filter TEXT;
BEGIN
  -- 1. Obter dados da campanha ou tenant
  IF p_campaign_id IS NOT NULL THEN
      SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
      IF NOT FOUND THEN RETURN NULL; END IF;
      
      v_success_criteria := v_campaign.success_criteria;
      v_link_filter := COALESCE(v_campaign.success_link_filter, '');
      
      -- Contagens específicas
      SELECT COUNT(*) INTO v_total_contacts FROM public.outbound_queue WHERE campaign_id = p_campaign_id;
      SELECT COUNT(*) INTO v_import_errors FROM public.campaign_import_logs WHERE campaign_id = p_campaign_id;
      SELECT COUNT(*) INTO v_sent_count FROM public.outbound_queue WHERE campaign_id = p_campaign_id AND status = 'sent';
      SELECT COUNT(*) INTO v_response_count FROM public.outbound_queue WHERE campaign_id = p_campaign_id AND response_detected = TRUE;
      
      -- Conversão específica
      IF v_success_criteria IS NULL OR array_length(v_success_criteria, 1) = 0 THEN
          v_conversion_count := v_response_count;
      ELSE
          WITH contact_conversions AS (
              SELECT 
                oq.contact_phone,
                (
                    ('CLIENT_RESPONDED' = ANY(v_success_criteria) AND oq.response_detected = TRUE)
                    OR
                    ('LINK_SENT' = ANY(v_success_criteria) AND v_link_filter <> '' AND EXISTS (
                        SELECT 1 FROM public.conversations c
                        JOIN public.messages m ON m.conversation_id = c.id
                        WHERE c.user_identifier = oq.contact_phone
                          AND c.tenant_id = oq.tenant_id
                          AND m.sender_type IN ('ai', 'bot', 'assistant')
                          AND m.content ILIKE '%' || v_link_filter || '%'
                          AND m.created_at >= oq.sent_at
                    ))
                ) as is_converted
              FROM public.outbound_queue oq
              WHERE oq.campaign_id = p_campaign_id AND oq.status = 'sent'
          )
          SELECT COUNT(*) INTO v_conversion_count FROM contact_conversions WHERE is_converted = TRUE;
      END IF;

  ELSIF p_tenant_id IS NOT NULL THEN
      -- Visão Global do Tenant
      SELECT SUM(total_contacts) INTO v_total_contacts FROM public.campaigns WHERE tenant_id = p_tenant_id;
      SELECT COUNT(*) INTO v_import_errors FROM public.campaign_import_logs WHERE tenant_id = p_tenant_id;
      SELECT COUNT(*) INTO v_sent_count FROM public.outbound_queue WHERE tenant_id = p_tenant_id AND status = 'sent';
      SELECT COUNT(*) INTO v_response_count FROM public.outbound_queue WHERE tenant_id = p_tenant_id AND response_detected = TRUE;
      
      -- Para a conversão global, simplificamos para resposta do cliente ou usamos a soma das campanhas
      v_conversion_count := v_response_count; -- Simplificação global
  ELSE
      RETURN NULL;
  END IF;

  RETURN json_build_object(
    'total_contacts', COALESCE(v_total_contacts, 0),
    'import_errors', COALESCE(v_import_errors, 0),
    'sent_count', COALESCE(v_sent_count, 0),
    'response_count', COALESCE(v_response_count, 0),
    'conversion_count', COALESCE(v_conversion_count, 0),
    'conversion_rate', CASE WHEN v_sent_count > 0 THEN ROUND((COALESCE(v_conversion_count, 0)::NUMERIC / v_sent_count) * 100, 1) ELSE 0 END
  );
END;
$$;
