-- ====================================================================
-- DIAGNÓSTICO 1: Por que 2 leads aparecem no cockpit?
-- Mostra quais campos ativaram o critério "OK Agente" para cada lead
-- ====================================================================
SELECT
  al.id,
  al.name,
  al.whatsapp,
  al.status AS lead_status,
  al.campaign_id,
  camp.name AS campaign_name,
  (al.metadata->>'simulation_accepted')::boolean AS simulation_accepted,
  (al.metadata->>'ok_agente')::boolean AS ok_agente,
  al.metadata->'accepted_proposal' AS accepted_proposal,
  al.metadata->>'pipeline_stage' AS pipeline_stage,
  al.metadata->>'formalization_status' AS formalization_status,
  al.created_at
FROM agent_leads al
JOIN campaigns camp ON camp.id = al.campaign_id
WHERE al.tenant_id = '<<SEU_TENANT_ID>>'
  AND (
      (al.metadata->>'simulation_accepted')::boolean = true
      OR (al.metadata->>'ok_agente')::boolean = true
      OR al.metadata->'accepted_proposal' IS NOT NULL
  )
ORDER BY al.created_at DESC;


-- ====================================================================
-- DIAGNÓSTICO 2: Todas as conversas do número do Marcial
-- Para entender qual conversa o RPC está selecionando (e qual deveria)
-- ====================================================================
SELECT
  c.id AS conversation_id,
  c.user_identifier,
  c.user_name,
  c.status,
  c.campaign_id,
  camp.name AS campaign_name,
  c.assigned_operator_id,
  c.last_message_at,
  c.created_at,
  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS total_messages,
  (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
  (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_msg_time
FROM conversations c
LEFT JOIN campaigns camp ON camp.id = c.campaign_id
WHERE c.tenant_id = '<<SEU_TENANT_ID>>'
  AND c.user_identifier IN (
    '5564996767961',
    '64996767961',
    '554996767961',
    '4996767961'
  )
ORDER BY c.last_message_at DESC NULLS LAST;


-- ====================================================================
-- DIAGNÓSTICO 3: As últimas 20 mensagens da conversa do Marcial
-- (substitua <<CONVERSATION_ID>> pelo ID encontrado no diagnóstico 2)
-- ====================================================================
SELECT
  m.id,
  m.conversation_id,
  m.sender_type,
  m.content,
  m.created_at
FROM messages m
WHERE m.conversation_id = '<<CONVERSATION_ID>>'  -- conversa com mais mensagens
ORDER BY m.created_at DESC
LIMIT 20;


-- ====================================================================
-- DIAGNÓSTICO 4: Bug de ECO WhatsApp — mensagens duplicadas
-- Mostra pares de mensagens com mesmo conteúdo dentro de 30 segundos
-- na conversa do GRUPO FK (ou qualquer conversation_id com suspeita)
-- ====================================================================
SELECT
  m.id,
  m.conversation_id,
  m.sender_type,
  m.direction,
  m.content,
  m.created_at,
  m.metadata->>'from_me' AS from_me_flag,
  m.metadata->>'message_id' AS whatsapp_message_id,
  m.metadata->>'source'    AS source
FROM messages m
WHERE m.conversation_id = 'a9148228-a021-43ed-8087-1b1f3de2a015'  -- Marcial
   OR m.conversation_id IN (
     -- Adicione conversation_id do GRUPO FK aqui se souber
     SELECT id FROM conversations
     WHERE user_identifier LIKE '%5527999339657%'
     LIMIT 1
   )
ORDER BY m.created_at ASC;


-- ====================================================================
-- DIAGNÓSTICO 5: Detectar pares duplicados por conteúdo + janela 60s
-- (mostra as mensagens que são eco — operator envia e aparece como cliente)
-- ====================================================================
SELECT
  m1.id         AS original_id,
  m1.sender_type AS original_sender,
  m1.content,
  m1.created_at  AS original_at,
  m2.id         AS echo_id,
  m2.sender_type AS echo_sender,
  m2.created_at  AS echo_at,
  EXTRACT(EPOCH FROM (m2.created_at - m1.created_at))::int AS diff_seconds
FROM messages m1
JOIN messages m2
  ON m1.conversation_id = m2.conversation_id
 AND m1.content = m2.content
 AND m1.id <> m2.id
 AND m1.sender_type IN ('human', 'operator', 'agent')
 AND m2.sender_type IN ('user', 'inbound', 'customer')
 AND m2.created_at > m1.created_at
 AND m2.created_at < m1.created_at + INTERVAL '60 seconds'
WHERE m1.conversation_id IN (
  'a9148228-a021-43ed-8087-1b1f3de2a015',
  -- adicione ID da conversa do GRUPO FK
  (SELECT id FROM conversations WHERE user_identifier LIKE '%5527999339657%' LIMIT 1)
)
ORDER BY m1.created_at ASC;

