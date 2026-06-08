-- =========================================================================
-- PERFORMANCE OPTIMIZATION: get_conversation_establishments
-- O problema original: O CTE `normalized_leads` rodava regexp_replace() 
-- em TODOS os agent_leads do tenant, gerando um Table Scan gigante de 8s.
-- Nova Lógica: Expande a entrada em variações e força "Index Scan".
-- =========================================================================

DROP FUNCTION IF EXISTS get_conversation_establishments(uuid,text[]);

CREATE OR REPLACE FUNCTION get_conversation_establishments(
  p_tenant_id UUID,
  p_user_identifiers TEXT[]
)
RETURNS TABLE (
  user_identifier TEXT,
  establishment_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_phones AS (
    SELECT DISTINCT 
      ui AS original_phone,
      regexp_replace(ui, '\D', '', 'g') AS clean_phone
    FROM unnest(COALESCE(p_user_identifiers, ARRAY[]::text[])) AS ui
    WHERE ui IS NOT NULL AND ui <> ''
  ),
  search_phones AS (
    -- Variante 1: Original
    SELECT original_phone, original_phone AS search_variant FROM input_phones
    UNION
    -- Variante 2: Limpo
    SELECT original_phone, clean_phone AS search_variant FROM input_phones
    UNION
    -- Variante 3: Limpo com +
    SELECT original_phone, '+' || clean_phone AS search_variant FROM input_phones
    UNION
    -- Variante 4: Sem 55
    SELECT original_phone, regexp_replace(clean_phone, '^55', '') AS search_variant FROM input_phones
    UNION
    -- Variante 5: Sem 55 com +
    SELECT original_phone, '+' || regexp_replace(clean_phone, '^55', '') AS search_variant FROM input_phones
    UNION
    -- Variante 6: Com 55
    SELECT original_phone, '55' || regexp_replace(clean_phone, '^55', '') AS search_variant FROM input_phones
    UNION
    -- Variante 7: Com +55
    SELECT original_phone, '+55' || regexp_replace(clean_phone, '^55', '') AS search_variant FROM input_phones
    UNION
    -- Variante 8: Máscara local (XX) XXXXX-XXXX
    SELECT original_phone, 
           '(' || substr(regexp_replace(clean_phone, '^55', ''), 1, 2) || ') ' || 
           substr(regexp_replace(clean_phone, '^55', ''), 3, length(regexp_replace(clean_phone, '^55', '')) - 6) || '-' ||
           substr(regexp_replace(clean_phone, '^55', ''), length(regexp_replace(clean_phone, '^55', '')) - 3)
    AS search_variant 
    FROM input_phones 
    WHERE length(regexp_replace(clean_phone, '^55', '')) IN (10, 11)
    UNION
    -- Variante 9: Máscara DDI +55 (XX) XXXXX-XXXX
    SELECT original_phone, 
           '+55 (' || substr(regexp_replace(clean_phone, '^55', ''), 1, 2) || ') ' || 
           substr(regexp_replace(clean_phone, '^55', ''), 3, length(regexp_replace(clean_phone, '^55', '')) - 6) || '-' ||
           substr(regexp_replace(clean_phone, '^55', ''), length(regexp_replace(clean_phone, '^55', '')) - 3)
    AS search_variant 
    FROM input_phones 
    WHERE length(regexp_replace(clean_phone, '^55', '')) IN (10, 11)
  )
  SELECT DISTINCT ON (s.original_phone)
    s.original_phone AS user_identifier,
    trim(al.name) AS establishment_name
  FROM search_phones s
  JOIN public.agent_leads al 
    ON al.tenant_id = p_tenant_id 
    AND al.whatsapp = s.search_variant
  WHERE al.name IS NOT NULL AND trim(al.name) <> ''
  ORDER BY s.original_phone, al.created_at DESC;
$$;
