-- ============================================================
-- SCRIPT DE CORREÇÃO E DIAGNÓSTICO: FUNIL EDENRED (V2)
-- Execute este script no console SQL do seu Supabase/Postgres.
-- ============================================================

-- 1. ATUALIZAÇÃO DA RPC DO FUNIL (ESPECÍFICO EDENRED)
-- Esta versão aceita variações de 'sender_type' (ai, bot, assistant, lia, system)
-- e agora filtra especificamente por links com 'fiservcapital'
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
  -- ── 1. Total de contatos únicos que iniciaram conversa no tenant ──
  SELECT COUNT(DISTINCT c.user_identifier)
  INTO   v_total_contacts
  FROM   conversations c
  WHERE  c.tenant_id = p_tenant_id
    AND  c.user_identifier IS NOT NULL;

  -- ── 2. Contatos únicos que receberam o link de simulação da Edenred/Fiserv ──
  SELECT COUNT(DISTINCT c.user_identifier)
  INTO   v_link_contacts
  FROM   conversations c
  WHERE  c.tenant_id = p_tenant_id
    AND  c.user_identifier IS NOT NULL
    AND  EXISTS (
      SELECT 1
      FROM   messages m
      WHERE  m.conversation_id = c.id
        -- Captura todas as variações de remetente da IA/Sistema
        AND  m.sender_type     IN ('ai', 'bot', 'assistant', 'lia', 'system')
        -- Filtro específico para links da FiservCapital (Edenred)
        AND  m.content ILIKE '%fiservcapital%'
    );

  -- ── 3. Cálculo da taxa de conversão ──
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

-- 2. CONSULTA DE DIAGNÓSTICO (ASTOR / EDENRED)
-- Rode esta consulta para verificar se o Astor possui mensagens com o link esperado
-- Tenant Edenred: 'd290f1ee-6c54-4b01-90e6-d701748f0851'
SELECT 
    c.id as conversation_id,
    c.tenant_id,
    c.user_identifier,
    m.sender_type,
    m.sender_name,
    m.content,
    m.created_at
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
WHERE c.user_identifier ILIKE '%5511993434870%'
  AND m.content ILIKE '%fiservcapital%'
ORDER BY m.created_at DESC
LIMIT 10;

