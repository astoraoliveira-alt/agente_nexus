-- ============================================================
-- [V62.7] RPC: get_campaign_dashboard_stats
-- Descrição: Agrega métricas resilientes usando tabelas de negócio e contagem lead-centric (DISTINCT conversation_id)
-- Correção: Adicionado import_errors para evitar NaN no Dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION get_campaign_dashboard_stats(
  p_campaign_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_contacts    BIGINT := 0;
  v_import_errors     BIGINT := 0;
  v_sent_count        BIGINT := 0;
  v_delivered_count   BIGINT := 0;
  v_read_count        BIGINT := 0;
  v_response_count    BIGINT := 0;
  v_conversion_count  BIGINT := 0;
  v_failed_count      BIGINT := 0;
  v_conversion_rate   NUMERIC := 0;
  v_success_criteria  TEXT[];
  v_link_filter       TEXT;
BEGIN
  -- 1. Metadados da Campanha
  IF p_campaign_id IS NOT NULL THEN
    SELECT 
        COALESCE(total_contacts, 0), 
        success_criteria, 
        success_link_filter 
    INTO v_total_contacts, v_success_criteria, v_link_filter
    FROM public.campaigns 
    WHERE id = p_campaign_id;

    -- Erros de importação (para evitar NaN no total)
    SELECT COUNT(*) INTO v_import_errors
    FROM public.campaign_import_logs
    WHERE campaign_id = p_campaign_id;
  END IF;

  -- 2. Métricas de Mensagens (Fonte da Verdade: messages e message_status_history)
  -- ENVIADOS (Leads únicos impactados)
  SELECT COUNT(DISTINCT conversation_id) INTO v_sent_count
  FROM public.messages
  WHERE (p_campaign_id IS NULL OR (metadata->>'campaign_id')::uuid = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND direction = 'outbound';

  -- ENTREGUES
  SELECT COUNT(DISTINCT m.conversation_id) INTO v_delivered_count
  FROM public.messages m
  JOIN public.message_status_history msh ON m.id = msh.message_id
  WHERE (p_campaign_id IS NULL OR (m.metadata->>'campaign_id')::uuid = p_campaign_id)
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND msh.status IN ('DELIVERED', 'READ', 'delivered', 'read');

  -- LIDOS
  SELECT COUNT(DISTINCT m.conversation_id) INTO v_read_count
  FROM public.messages m
  JOIN public.message_status_history msh ON m.id = msh.message_id
  WHERE (p_campaign_id IS NULL OR (m.metadata->>'campaign_id')::uuid = p_campaign_id)
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND msh.status IN ('READ', 'read');

  -- INTERAGIRAM (Respostas Recebidas)
  SELECT COUNT(DISTINCT m_out.conversation_id) INTO v_response_count
  FROM public.messages m_out
  WHERE (p_campaign_id IS NULL OR (m_out.metadata->>'campaign_id')::uuid = p_campaign_id)
    AND (p_tenant_id IS NULL OR m_out.tenant_id = p_tenant_id)
    AND EXISTS (
        SELECT 1 FROM public.messages m_in
        WHERE m_in.conversation_id = m_out.conversation_id
          AND m_in.direction = 'inbound'
    );

  -- 3. Conversão (Sucesso)
  IF p_campaign_id IS NOT NULL AND v_success_criteria IS NOT NULL AND array_length(v_success_criteria, 1) > 0 THEN
      SELECT COUNT(DISTINCT m_out.conversation_id) INTO v_conversion_count
      FROM public.messages m_out
      WHERE (m_out.metadata->>'campaign_id')::uuid = p_campaign_id
        AND (
          ('CLIENT_RESPONDED' = ANY(v_success_criteria) AND EXISTS (
              SELECT 1 FROM public.messages m_in
              WHERE m_in.conversation_id = m_out.conversation_id AND m_in.direction = 'inbound'
          ))
          OR
          ('LINK_SENT' = ANY(v_success_criteria) AND EXISTS (
              SELECT 1 FROM public.messages m_link
              WHERE m_link.conversation_id = m_out.conversation_id
                AND m_link.sender_type NOT IN ('user', 'customer')
                AND (v_link_filter IS NULL OR v_link_filter = '' OR m_link.content ILIKE '%' || v_link_filter || '%')
          ))
        );
  ELSE
      v_conversion_count := v_response_count;
  END IF;

  -- 4. Resultados Finais
  v_failed_count := v_sent_count - v_delivered_count; 
  v_conversion_rate := CASE WHEN v_sent_count = 0 THEN 0 ELSE ROUND((v_conversion_count::NUMERIC / v_sent_count) * 100, 1) END;

  RETURN json_build_object(
    'total_contacts',    COALESCE(v_total_contacts, 0),
    'import_errors',     COALESCE(v_import_errors, 0),
    'sent_count',        COALESCE(v_sent_count, 0),
    'delivered_count',   COALESCE(v_delivered_count, 0),
    'read_count',        COALESCE(v_read_count, 0),
    'response_count',    COALESCE(v_response_count, 0),
    'conversion_count',  COALESCE(v_conversion_count, 0),
    'failed_count',      GREATEST(0, v_failed_count),
    'conversion_rate',   COALESCE(v_conversion_rate, 0)
  );
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION get_campaign_dashboard_stats(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_dashboard_stats(UUID, UUID) TO service_role;
