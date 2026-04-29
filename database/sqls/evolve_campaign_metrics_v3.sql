-- MIGRATION: Evolução de Métricas de Campanha (Contador Real de Mensagens & Taxa de Sucesso Yield)
-- Versão 1.3

-- 1. ADICIONAR COLUNAS DE MÉTRICAS REAIS
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS total_messages INTEGER DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS conversion_count INTEGER DEFAULT 0;

-- 2. ÍNDICE DE PERFORMANCE (CRITICAL)
-- Melhora drasticamente a busca de mensagens por telefone do lead
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_identifier);

-- 3. ATUALIZAÇÃO DA RPC DE ESTATÍSTICAS
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
  v_campaign RECORD;
  v_total_contacts BIGINT := 0;
  v_import_errors BIGINT := 0;
  v_sent_count BIGINT := 0;
  v_response_count BIGINT := 0;
  v_conversion_count BIGINT := 0;
  v_total_messages BIGINT := 0;
  v_success_criteria TEXT[];
  v_link_filter TEXT;
BEGIN
  -- 1. Obter dados da campanha ou tenant
  IF p_campaign_id IS NOT NULL THEN
      SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
      IF NOT FOUND THEN RETURN NULL; END IF;
      
      v_success_criteria := v_campaign.success_criteria;
      v_link_filter := COALESCE(v_campaign.success_link_filter, '');
      
      -- Contagens básicas
      SELECT COUNT(*) INTO v_total_contacts FROM public.outbound_queue WHERE campaign_id = p_campaign_id;
      SELECT COUNT(*) INTO v_import_errors FROM public.campaign_import_logs WHERE campaign_id = p_campaign_id;
      SELECT COUNT(*) INTO v_sent_count FROM public.outbound_queue WHERE campaign_id = p_campaign_id AND status = 'sent';
      SELECT COUNT(*) INTO v_response_count FROM public.outbound_queue WHERE campaign_id = p_campaign_id AND response_detected = TRUE;
      
      -- CONTADOR REAL DE MENSAGENS
      -- Soma todas as mensagens de todas as conversas vinculadas aos telefones desta campanha
      -- Usa substituição de caracteres não numéricos para garantir o join (e.g. +55 vs 55)
      SELECT COUNT(m.id) INTO v_total_messages
      FROM public.outbound_queue oq
      JOIN public.conversations conv ON 
        REGEXP_REPLACE(conv.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
        AND conv.tenant_id = oq.tenant_id
      JOIN public.messages m ON m.conversation_id = conv.id
      WHERE oq.campaign_id = p_campaign_id;
      
      -- CONVERSÃO (LINK ENVIADO OU RESPOSTA)
      -- Sincronizado para evitar sobrecontagem e exigir filtro para Link
      WITH contact_conversions AS (
          SELECT 
            oq.contact_phone,
            (
                -- Caso 1: Critério é explicitamente CLIENT_RESPONDED
                ('CLIENT_RESPONDED' = ANY(v_success_criteria) AND (oq.response_detected = TRUE OR EXISTS (
                    SELECT 1 FROM public.messages mr JOIN public.conversations cr ON mr.conversation_id = cr.id
                    WHERE REGEXP_REPLACE(cr.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
                      AND cr.tenant_id = oq.tenant_id 
                      AND mr.sender_type = 'user'
                )))
                OR
                -- Caso 2: Critério é explicitamente LINK_SENT (Exige filtro)
                ('LINK_SENT' = ANY(v_success_criteria) AND v_link_filter <> '' AND EXISTS (
                    SELECT 1 FROM public.messages m2
                    JOIN public.conversations c2 ON m2.conversation_id = c2.id
                    WHERE REGEXP_REPLACE(c2.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
                      AND c2.tenant_id = oq.tenant_id
                      AND m2.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
                      AND m2.content ILIKE '%' || v_link_filter || '%'
                ))
            ) as is_converted
          FROM public.outbound_queue oq
          WHERE oq.campaign_id = p_campaign_id AND oq.status = 'sent'
      )
      SELECT COUNT(DISTINCT contact_phone) INTO v_conversion_count 
      FROM contact_conversions 
      WHERE is_converted = TRUE;

  ELSIF p_tenant_id IS NOT NULL THEN
      -- Visão Global do Tenant
      SELECT SUM(total_contacts) INTO v_total_contacts FROM public.campaigns WHERE tenant_id = p_tenant_id;
      SELECT COUNT(*) INTO v_import_errors FROM public.campaign_import_logs WHERE tenant_id = p_tenant_id;
      SELECT COUNT(*) INTO v_sent_count FROM public.outbound_queue WHERE tenant_id = p_tenant_id AND status = 'sent';
      SELECT COUNT(*) INTO v_response_count FROM public.outbound_queue WHERE tenant_id = p_tenant_id AND response_detected = TRUE;
      
      -- Para performance global, usamos os campos sincronizados na tabela de campanhas
      SELECT SUM(total_messages) INTO v_total_messages FROM public.campaigns WHERE tenant_id = p_tenant_id;
      SELECT SUM(conversion_count) INTO v_conversion_count FROM public.campaigns WHERE tenant_id = p_tenant_id;
  ELSE
      RETURN NULL;
  END IF;

  RETURN json_build_object(
    'total_contacts', COALESCE(v_total_contacts, 0),
    'import_errors', COALESCE(v_import_errors, 0),
    'sent_count', COALESCE(v_sent_count, 0),
    'response_count', COALESCE(v_response_count, 0),
    'conversion_count', COALESCE(v_conversion_count, 0),
    'total_messages', COALESCE(v_total_messages, 0),
    -- TAXA DE SUCESSO YIELD (CONVERSÕES / ENVIADOS)
    'conversion_rate', CASE WHEN v_sent_count > 0 THEN ROUND((COALESCE(v_conversion_count, 0)::NUMERIC / v_sent_count) * 100, 1) ELSE 0 END
  );
END;
$$;

-- 4. ATUALIZAÇÃO DO MODELO DE CAMPANHAS (DADOS DE SUMÁRIO)
UPDATE public.campaigns c
SET 
  total_messages = (
    SELECT COUNT(m.id)
    FROM outbound_queue oq
    JOIN conversations conv ON 
      REGEXP_REPLACE(conv.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
      AND conv.tenant_id = oq.tenant_id
    JOIN messages m ON m.conversation_id = conv.id
    WHERE oq.campaign_id = c.id
  ),
  conversion_count = (
    SELECT COUNT(DISTINCT oq.contact_phone)
    FROM outbound_queue oq
    WHERE oq.campaign_id = c.id AND (
        -- Caso 1: Critério é explicitamente CLIENT_RESPONDED
        ('CLIENT_RESPONDED' = ANY(c.success_criteria) AND (oq.response_detected = TRUE OR EXISTS (
            SELECT 1 FROM messages mr JOIN conversations cr ON mr.conversation_id = cr.id
            WHERE REGEXP_REPLACE(cr.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
              AND cr.tenant_id = oq.tenant_id 
              AND mr.sender_type = 'user'
        )))
        OR
        -- Caso 2: Critério é explicitamente LINK_SENT (Exige que o filtro não seja vazio)
        ('LINK_SENT' = ANY(c.success_criteria) AND EXISTS (
            SELECT 1 FROM messages m3
            JOIN conversations c3 ON m3.conversation_id = c3.id
            WHERE REGEXP_REPLACE(c3.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
              AND c3.tenant_id = oq.tenant_id
              AND m3.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
              AND COALESCE(c.success_link_filter, '') <> '' 
              AND m3.content ILIKE '%' || c.success_link_filter || '%'
        ))
    )
  );
