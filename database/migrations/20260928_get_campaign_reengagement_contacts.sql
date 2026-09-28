-- ==============================================================================
-- MIGRATION: 20260928_get_campaign_reengagement_contacts.sql
-- Descrição:
--   Cria a RPC 'get_campaign_reengagement_contacts' com SECURITY DEFINER
--   para retornar todos os contatos de uma campanha com o status unificado
--   de entrega da mensagem (outbound_queue) e status de crédito (agent_leads),
--   garantindo 100% de consistência com o Dashboard Executivo ('get_credit_campaign_funnel_stats').
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_campaign_reengagement_contacts(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_campaign_reengagement_contacts(
  p_tenant_id UUID,
  p_campaign_id UUID
)
RETURNS TABLE (
  id UUID,
  contact_name TEXT,
  contact_phone TEXT,
  clean_phone TEXT,
  identifier TEXT,
  original_status TEXT,
  delivered BOOLEAN,
  read BOOLEAN,
  replied BOOLEAN,
  failed BOOLEAN,
  credit_status TEXT,
  credit_declined_reason TEXT,
  credit_declined_days_ago INT,
  credit_declined_60d BOOLEAN,
  credit_approved BOOLEAN,
  is_busy BOOLEAN,
  reengagement_count INT,
  last_scheduled_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH camp_leads AS (
    SELECT
      al.id AS lead_id,
      al.whatsapp,
      regexp_replace(al.whatsapp, '\D', '', 'g') AS lead_clean_phone,
      regexp_replace(COALESCE(al.identifier, ''), '\D', '', 'g') AS lead_clean_idf,
      (
        lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved')
        OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado')
      ) AS is_app,
      (
        lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled')
        OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
      ) AS is_dec,
      COALESCE(
        al.metadata->>'lost_reason',
        al.metadata->>'refusal_reason',
        'Proposta recusada em análise de crédito'
      ) AS dec_reason,
      EXTRACT(DAY FROM (NOW() - COALESCE(
        NULLIF(al.metadata->>'fiserv_last_audit_at', '')::timestamptz,
        NULLIF(al.metadata->>'lost_at', '')::timestamptz,
        NULLIF(al.metadata->>'refusal_date', '')::timestamptz,
        NULLIF(al.metadata->>'fiserv_requested_at', '')::timestamptz,
        al.created_at
      )))::INT AS dec_days_ago
    FROM agent_leads al
    WHERE al.tenant_id = p_tenant_id
      AND al.campaign_id = p_campaign_id
  ),
  queue_agg AS (
    SELECT
      oq.id AS q_id,
      oq.contact_name::TEXT AS q_contact_name,
      oq.contact_phone::TEXT AS q_contact_phone,
      regexp_replace(oq.contact_phone, '\D', '', 'g') AS q_clean_phone,
      COALESCE(oq.metadata->>'identifier', oq.metadata->>'cnpj', oq.metadata->>'cpf', '')::TEXT AS q_identifier,
      regexp_replace(COALESCE(oq.metadata->>'identifier', oq.metadata->>'cnpj', oq.metadata->>'cpf', ''), '\D', '', 'g') AS q_clean_idf,
      oq.status::TEXT AS q_original_status,
      (
        trim(lower(oq.status)) IN ('sent', 'delivered', 'read', 'respondida', 'interagiu')
        OR COALESCE(oq.response_detected, false) = true
      ) AS q_delivered,
      (
        trim(lower(oq.status)) IN ('read', 'respondida', 'interagiu')
      ) AS q_read,
      (
        COALESCE(oq.response_detected, false) = true
        OR trim(lower(oq.status)) IN ('respondida', 'interagiu')
      ) AS q_replied,
      (
        trim(lower(oq.status)) IN ('failed', 'undelivered', 'error', 'not_delivered', 'rejected')
      ) AS q_failed,
      (
        trim(lower(oq.status)) IN ('pending', 'processing')
      ) AS q_busy,
      CASE WHEN (oq.metadata->>'is_reengagement')::boolean = true THEN 1 ELSE 0 END AS q_reengagement,
      oq.scheduled_at AS q_scheduled_at,
      oq.metadata AS q_metadata
    FROM outbound_queue oq
    WHERE oq.tenant_id = p_tenant_id
      AND oq.campaign_id = p_campaign_id
  )
  SELECT
    q.q_id AS id,
    q.q_contact_name AS contact_name,
    q.q_contact_phone AS contact_phone,
    q.q_clean_phone AS clean_phone,
    q.q_identifier AS identifier,
    q.q_original_status AS original_status,
    q.q_delivered AS delivered,
    q.q_read AS read,
    q.q_replied AS replied,
    q.q_failed AS failed,
    CASE
      WHEN COALESCE(l.is_app, false) THEN 'approved'
      WHEN COALESCE(l.is_dec, false) THEN 'declined_60d'
      ELSE 'none'
    END AS credit_status,
    l.dec_reason AS credit_declined_reason,
    l.dec_days_ago AS credit_declined_days_ago,
    COALESCE(l.is_dec, false) AS credit_declined_60d,
    COALESCE(l.is_app, false) AS credit_approved,
    q.q_busy AS is_busy,
    q.q_reengagement AS reengagement_count,
    q.q_scheduled_at AS last_scheduled_at,
    q.q_metadata AS metadata
  FROM queue_agg q
  LEFT JOIN camp_leads l ON (
    l.lead_clean_phone = q.q_clean_phone
    OR (l.lead_clean_idf <> '' AND l.lead_clean_idf = q.q_clean_idf)
    OR (length(q.q_clean_phone) > 11 AND substring(q.q_clean_phone from 3) = l.lead_clean_phone)
    OR (length(l.lead_clean_phone) > 11 AND substring(l.lead_clean_phone from 3) = q.q_clean_phone)
  )
  ORDER BY q.q_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_reengagement_contacts(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_reengagement_contacts(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_reengagement_contacts(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
