-- Davos Nexus - Seed Data (Mock Data Sync)
-- Generated from src/lib/mock-data.ts & mock-extended-data.ts

-- =============================================
-- 1. COMPANIES (Tenants)
-- =============================================
INSERT INTO companies (id, name, slug, status, plan_tier, created_at, plan_details, privacy_settings, api_key) VALUES
('d290f1ee-6c54-4b01-90e6-d701748f0851', 'Banco Digital Alpha', 'banco-alpha', 'active', 'flex', '2024-01-15T00:00:00Z', 
 '{"type": "flex", "basePrice": 2499.00}'::jsonb, 
 '{"anonymization": true, "retention_days": 365}'::jsonb, 'sk_live_alpha_12345'),

('a1b2c3d4-e5f6-7890-1234-567890abcdef', 'Seguradora Beta', 'seguradora-beta', 'active', 'fixed', '2024-03-22T00:00:00Z', 
 '{"type": "fixed", "hardLimits": {"agents": 5}}'::jsonb, 
 '{"anonymization": false, "retention_days": 180}'::jsonb, 'sk_live_beta_67890'),

('f9e8d7c6-b5a4-3210-fedc-ba0987654321', 'Fintech Gamma', 'fintech-gamma', 'trial', 'fixed', '2025-01-10T00:00:00Z', 
 '{"type": "fixed", "limits": {"agents": 2}}'::jsonb, 
 '{"anonymization": false, "retention_days": 30}'::jsonb, 'sk_test_gamma_00000');

-- =============================================
-- 2. USERS
-- =============================================
INSERT INTO users (id, tenant_id, full_name, email, role, is_active) VALUES
-- System / Tenant 1 Users
('11111111-0000-0000-0000-000000000001', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Carlos Silva', 'carlos@davos.ai', 'super_admin', true),
('11111111-0000-0000-0000-000000000002', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Ana Rodrigues', 'ana@bancoalpha.com', 'tenant_admin', true),
('11111111-0000-0000-0000-000000000003', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Pedro Santos', 'pedro@bancoalpha.com', 'operator', true),
('11111111-0000-0000-0000-000000000004', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Marina Costa', 'marina@bancoalpha.com', 'operator', true),

-- Tenant 2 Users
('22222222-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'Roberto Justos', 'roberto@seguradora.com', 'tenant_admin', true),
('22222222-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'Julia Paes', 'julia@seguradora.com', 'operator', true);

-- Connect ISO Responsibles to Company (Update)
UPDATE companies SET ai_system_owner_id = '11111111-0000-0000-0000-000000000001', risk_owner_id = '11111111-0000-0000-0000-000000000002' 
WHERE id = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

-- =============================================
-- 3. AGENTS
-- =============================================
-- Agent 1: Atendimento Geral (Alpha)
INSERT INTO agents (id, tenant_id, name, status, risk_level, risk_score, lifecycle_stage, autonomy_level, active_conversations, total_conversations, channels, brain_config, voice_config) VALUES
('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Atendimento Geral', 'active', 'medium', 45, 'production', 4, 47, 15234, ARRAY['text', 'voice'],
 '{"systemPrompt": "Você é um assistente virtual do Banco Alpha...", "modelId": "gpt-4o", "temperature": 0.3}'::jsonb,
 '{"provider": "retell", "retellAgentId": "agent_123456789", "ambientSound": "clean"}'::jsonb);

-- Agent 2: Suporte Técnico (Alpha)
INSERT INTO agents (id, tenant_id, name, status, risk_level, risk_score, lifecycle_stage, autonomy_level, active_conversations, total_conversations, channels, brain_config, voice_config) VALUES
('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Suporte Técnico', 'active', 'low', 12, 'production', 5, 23, 8921, ARRAY['text'],
 '{"systemPrompt": "Você é um especialista em suporte técnico...", "modelId": "gpt-4o", "temperature": 0.2}'::jsonb,
 '{"provider": "none"}'::jsonb);

-- Agent 3: Vendas (Alpha) - High Risk
INSERT INTO agents (id, tenant_id, name, status, risk_level, risk_score, lifecycle_stage, autonomy_level, active_conversations, total_conversations, channels, brain_config, voice_config) VALUES
('aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Vendas', 'active', 'high', 78, 'validation', 2, 12, 5673, ARRAY['text', 'voice'],
 '{"systemPrompt": "Você é um consultor de vendas... Cuidado com promessas.", "modelId": "gpt-4o", "temperature": 0.5}'::jsonb,
 '{"provider": "retell"}'::jsonb);

-- Agent 4: Cobrança (Alpha) - Inactive
INSERT INTO agents (id, tenant_id, name, status, risk_level, risk_score, lifecycle_stage, autonomy_level, active_conversations, total_conversations, channels, brain_config, voice_config) VALUES
('aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Cobrança', 'inactive', 'high', 85, 'retired', 1, 0, 3421, ARRAY['voice'],
 '{"systemPrompt": "Cobrança amigável...", "modelId": "gpt-3.5-turbo", "temperature": 0.1}'::jsonb,
 '{"provider": "retell"}'::jsonb);

-- Agent 5: Sinistros (Beta)
INSERT INTO agents (id, tenant_id, name, status, risk_level, risk_score, lifecycle_stage, autonomy_level, active_conversations, total_conversations, channels, brain_config, voice_config) VALUES
('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'Sinistros Auto', 'active', 'medium', 50, 'development', 3, 5, 120, ARRAY['text'],
 '{"systemPrompt": "Assistente de Sinistros...", "modelId": "claude-3-5-sonnet", "temperature": 0.2}'::jsonb,
 '{"provider": "none"}'::jsonb);

-- =============================================
-- 4. POLICIES
-- =============================================
INSERT INTO policies (id, tenant_id, name, version, is_active, rules) VALUES
('cccccccc-1111-1111-1111-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Política Geral de Atendimento', '2.1', true, 
 '{"canDo": ["Responder dúvidas"], "cannotDo": ["Transações > R$1k"], "transferConditions": ["Cliente irritado"]}'::jsonb),
('cccccccc-2222-2222-2222-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Política de Vendas', '1.0', true, 
 '{"canDo": ["Simular valores"], "cannotDo": ["Prometer aprovação"]}'::jsonb);

-- =============================================
-- 5. FLOWS & STAGES
-- =============================================
-- Flow 1: Suporte Técnico - Acesso
INSERT INTO flows (id, tenant_id, name, direction, objective, success_criteria, status) VALUES
('ffffffff-1111-1111-1111-ffffffffffff', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'Suporte Técnico - Acesso', 'inbound', 'Restaurar acesso do cliente', 'Cliente acessa conta', 'active');

INSERT INTO flow_stages (flow_id, step_order, name, type, description, expected_outcome, actor, escalation_rule) VALUES
('ffffffff-1111-1111-1111-ffffffffffff', 1, 'Identificação', 'greeting', 'Identificar cliente', 'Cliente identificado', 'ai', null),
('ffffffff-1111-1111-1111-ffffffffffff', 2, 'Diagnóstico', 'qualification', 'Identificar erro', 'Erro mapeado', 'ai', null),
('ffffffff-1111-1111-1111-ffffffffffff', 3, 'Resolução Auto', 'resolution', 'Reset de senha', 'Acesso restaurado', 'ai', 'fallback_humano_se_erro_3x'),
('ffffffff-1111-1111-1111-ffffffffffff', 4, 'Escalonamento', 'handoff', 'Transferir', 'Humano assumiu', 'human', null),
('ffffffff-1111-1111-1111-ffffffffffff', 5, 'Confirmação', 'closing', 'Confirmar sucesso', 'Validado', 'both', null);

-- Link Agents to Flow
INSERT INTO agent_flows (agent_id, flow_id, is_primary) VALUES
('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'ffffffff-1111-1111-1111-ffffffffffff', true),
('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', 'ffffffff-1111-1111-1111-ffffffffffff', false);

-- =============================================
-- 6. INCIDENTS
-- =============================================
INSERT INTO incidents (id, tenant_id, agent_id, title, description, severity, status, reported_by, created_at) VALUES
('e0e0e0e0-1111-1111-1111-e0e0e0e0e0e0', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'Resposta incorreta taxas', 'Taxa desatualizada informada', 'medium', 'resolved', '11111111-0000-0000-0000-000000000003', NOW() - INTERVAL '10 days');

-- =============================================
-- 7. CONVERSATIONS & MESSAGES (Active Human Handoff Example)
-- =============================================
INSERT INTO conversations (id, tenant_id, agent_id, user_identifier, user_name, channel, status, assigned_operator_id, current_flow_id, last_message_at) VALUES
('cccccccc-0000-0000-0000-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', '5511999990000', 'João Oliveira', 'text', 'human_active', '11111111-0000-0000-0000-000000000003', 'ffffffff-1111-1111-1111-ffffffffffff', NOW());

INSERT INTO messages (conversation_id, tenant_id, sender_type, content, created_at) VALUES
('cccccccc-0000-0000-0000-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'user', 'Não consigo acessar o app', NOW() - INTERVAL '10 minutes'),
('cccccccc-0000-0000-0000-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'ai', 'Qual erro aparece?', NOW() - INTERVAL '9 minutes'),
('cccccccc-0000-0000-0000-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'user', 'Erro 500', NOW() - INTERVAL '8 minutes'),
('cccccccc-0000-0000-0000-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'ai', 'Vou transferir para um humano.', NOW() - INTERVAL '7 minutes'),
('cccccccc-0000-0000-0000-cccccccccccc', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'human', 'Olá, sou Pedro. Já vi seu erro.', NOW() - INTERVAL '5 minutes');

-- =============================================
-- 8. CONSUMPTION SAMPLE
-- =============================================
INSERT INTO consumption_metrics (tenant_id, agent_id, channel, metric_type, value, cost, recorded_at) VALUES
('d290f1ee-6c54-4b01-90e6-d701748f0851', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'text', 'tokens', 1500, 0.15, NOW());

-- =============================================
-- 9. AUDIT LOG SAMPLE
-- =============================================
INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target_type, target_id, details) VALUES
('d290f1ee-6c54-4b01-90e6-d701748f0851', '11111111-0000-0000-0000-000000000001', 'Carlos Silva', 'auth.login', 'system', null, 'Login via 2FA');
