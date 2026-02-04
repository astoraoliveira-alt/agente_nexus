-- =============================================
-- TARGETED REFERENCE DATA FOR N8N
-- User-Provided IDs:
-- Tenant: d290f1ee-6c54-4b01-90e6-d701748f0851
-- Agent:  aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa
-- User:   11993434870
-- =============================================

-- 1. Create/Ensure the Conversation Exists
-- We use a fixed UUID for the conversation to make it easy to finding in N8N
INSERT INTO conversations (
    id,
    tenant_id,
    agent_id,
    user_identifier,
    user_name,
    channel,
    status,
    created_at,
    last_message_at
)
VALUES (
    'beefcafe-0000-0000-0000-000000000001', -- Fixed Test ID
    'd290f1ee-6c54-4b01-90e6-d701748f0851', -- Provided Tenant
    'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', -- Provided Agent
    '11993434870',                          -- Provided User Identifier
    'Cliente WhatsApp Teste',
    'whatsapp',
    'ai_active',
    NOW() - INTERVAL '1 hour',
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert Message Sequence

-- A) Inbound Message (User -> AI)
INSERT INTO messages (conversation_id, tenant_id, sender_type, content, created_at)
VALUES (
    'beefcafe-0000-0000-0000-000000000001',
    'd290f1ee-6c54-4b01-90e6-d701748f0851',
    'user',
    'Olá, gostaria de saber o status do meu pedido #12345.',
    NOW() - INTERVAL '5 minutes'
);

-- B) Outbound Response (AI -> User)
-- Simulating N8N JSON payload
INSERT INTO messages (conversation_id, tenant_id, sender_type, content, created_at)
VALUES (
    'beefcafe-0000-0000-0000-000000000001',
    'd290f1ee-6c54-4b01-90e6-d701748f0851',
    'ai',
    '{"content": "Olá! Verifiquei aqui e seu pedido #12345 já saiu para entrega. A previsão é chegar hoje até as 18h."}',
    NOW() - INTERVAL '4 minutes'
);

-- C) Human Intervention (Platform -> User)
-- Simulating an operator taking over
INSERT INTO messages (conversation_id, tenant_id, sender_type, sender_name, content, created_at)
VALUES (
    'beefcafe-0000-0000-0000-000000000001',
    'd290f1ee-6c54-4b01-90e6-d701748f0851',
    'human',
    'Operador Teste',
    'Oi! Só confirmando: o entregador ligou dizendo que está próximo.',
    NOW() - INTERVAL '1 minute'
);
