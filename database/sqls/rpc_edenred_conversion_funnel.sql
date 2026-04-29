-- ============================================================
-- RPC: get_edenred_conversion_funnel
-- Tenant: d290f1ee-6c54-4b01-90e6-d701748f0851 (Edenred)
-- ============================================================
-- Returns two numbers:
--   total_contacts   → unique contacts (user_identifier) that had
--                      at least one conversation with the AI
--   link_sent_contacts → unique contacts where the AI sent the
--                        proposal link at least once (deduped by contact)
--
-- "Proposal link" detection strategy:
--   A message qualifies when sender_type IN ('ai','bot','assistant','lia','system')
--   AND the content contains 'fiservcapital' (specific to Edenred simulation).
-- ============================================================

CREATE OR REPLACE FUNCTION get_edenred_conversion_funnel(
  p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_contacts   BIGINT;
  v_link_contacts    BIGINT;
  v_conversion_rate  NUMERIC;
BEGIN
  -- ── 1. Total unique contacts that had at least one conversation ──
  SELECT COUNT(DISTINCT c.user_identifier)
  INTO   v_total_contacts
  FROM   conversations c
  WHERE  c.tenant_id = p_tenant_id
    AND  c.user_identifier IS NOT NULL;

  -- ── 2. Unique contacts where AI sent a message containing the specific link ──
  SELECT COUNT(DISTINCT c.user_identifier)
  INTO   v_link_contacts
  FROM   conversations c
  WHERE  c.tenant_id = p_tenant_id
    AND  c.user_identifier IS NOT NULL
    AND  EXISTS (
      SELECT 1
      FROM   messages m
      WHERE  m.conversation_id = c.id
        -- Permissive AI sender list
        AND  m.sender_type     IN ('ai', 'bot', 'assistant', 'lia', 'system')
        -- Specific Edenred simulation link detection
        AND  m.content ILIKE '%fiservcapital%'
    );

  -- ── 3. Conversion rate ──
  v_conversion_rate := CASE
    WHEN v_total_contacts = 0 THEN 0
    ELSE ROUND((v_link_contacts::NUMERIC / v_total_contacts) * 100, 1)
  END;

  RETURN json_build_object(
    'total_contacts',    v_total_contacts,
    'link_sent_contacts', v_link_contacts,
    'conversion_rate',   v_conversion_rate
  );
END;
$$;

-- Grant permissions if not already present
GRANT EXECUTE ON FUNCTION get_edenred_conversion_funnel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_edenred_conversion_funnel(UUID) TO service_role;

