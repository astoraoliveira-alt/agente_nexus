-- MIGRATION: Observabilidade de Campanhas & Critérios de Sucesso
-- Versão 1.0

-- 1. EVOLUIR TABELA DE CAMPANHAS
DO $$ 
BEGIN 
    -- Adicionar critérios de sucesso
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='success_criteria') THEN
        ALTER TABLE public.campaigns ADD COLUMN success_criteria TEXT[] DEFAULT '{}';
    END IF;

    -- Adicionar filtro de link
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='success_link_filter') THEN
        ALTER TABLE public.campaigns ADD COLUMN success_link_filter TEXT;
    END IF;
    -- Adicionar contador de erros de importação
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='import_error_count') THEN
        ALTER TABLE public.campaigns ADD COLUMN import_error_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. CRIAR TABELA DE LOGS DE IMPORTAÇÃO
CREATE TABLE IF NOT EXISTS public.campaign_import_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    error_type TEXT NOT NULL, -- Ex: 'INVALID_PHONE', 'DUPLICATE', 'MISSING_NAME'
    error_message TEXT,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. SEGURANÇA (RLS)
ALTER TABLE public.campaign_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Access Import Logs" ON public.campaign_import_logs;
CREATE POLICY "Tenant Access Import Logs" ON public.campaign_import_logs
FOR ALL 
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- 4. PERMISSÕES E ÍNDICES
GRANT ALL ON public.campaign_import_logs TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_import_logs_campaign ON public.campaign_import_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_tenant ON public.campaign_import_logs(tenant_id);

-- 5. COMENTÁRIOS
COMMENT ON TABLE public.campaign_import_logs IS 'Armazena inconsistências detectadas durante o carregamento de bases de campanha.';

-- 6. RPC DE DASHBOARD EXECUTIVO
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
  v_response_count    BIGINT := 0;
  v_conversion_count  BIGINT := 0;
  v_conversion_rate   NUMERIC := 0;
  v_success_criteria  TEXT[];
  v_link_filter       TEXT;
BEGIN
  IF p_campaign_id IS NOT NULL THEN
    SELECT success_criteria, success_link_filter INTO v_success_criteria, v_link_filter
    FROM campaigns WHERE id = p_campaign_id;
  END IF;

  SELECT COUNT(*) INTO v_total_contacts FROM outbound_queue
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  SELECT COUNT(*) INTO v_import_errors FROM campaign_import_logs
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  SELECT COUNT(*) INTO v_sent_count FROM outbound_queue
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id) AND status = 'sent';

  SELECT COUNT(*) INTO v_response_count FROM outbound_queue
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id) AND response_detected = true;

  IF p_campaign_id IS NOT NULL AND v_success_criteria IS NOT NULL AND array_length(v_success_criteria, 1) > 0 THEN
      SELECT COUNT(DISTINCT oq.id) INTO v_conversion_count FROM outbound_queue oq
      WHERE oq.campaign_id = p_campaign_id AND (
          ('CLIENT_RESPONDED' = ANY(v_success_criteria) AND oq.response_detected = true) OR
          ('LINK_SENT' = ANY(v_success_criteria) AND EXISTS (
             SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
             WHERE c.user_identifier = oq.contact_phone AND c.tenant_id = oq.tenant_id
               AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
               AND (v_link_filter IS NULL OR m.content ILIKE '%' || v_link_filter || '%')
          ))
      );
  ELSE
      v_conversion_count := v_response_count;
  END IF;

  v_conversion_rate := CASE WHEN v_sent_count = 0 THEN 0 ELSE ROUND((v_conversion_count::NUMERIC / v_sent_count) * 100, 1) END;

  RETURN json_build_object(
    'total_contacts', v_total_contacts,
    'import_errors', v_import_errors,
    'sent_count', v_sent_count,
    'response_count', v_response_count,
    'conversion_count', v_conversion_count,
    'conversion_rate', v_conversion_rate
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_campaign_dashboard_stats(UUID, UUID) TO authenticated, service_role;
