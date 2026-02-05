-- =============================================
-- Migration: Create Plans Table and Seed Data
-- =============================================

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('fixed', 'flex', 'unlimited')),
    description TEXT,
    base_price NUMERIC DEFAULT 0,
    llm_token_price NUMERIC DEFAULT 0,
    message_price NUMERIC DEFAULT 0,
    stt_minute_price NUMERIC DEFAULT 0,
    tts_minute_price NUMERIC DEFAULT 0,
    default_limits JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow public access for now (Platform Management)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON plans FOR SELECT USING (true);
CREATE POLICY "Allow public write access" ON plans FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON plans FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON plans FOR DELETE USING (true);

-- Seed Data (Upsert to avoid duplicates)
INSERT INTO plans (id, name, type, description, base_price, llm_token_price, message_price, stt_minute_price, tts_minute_price, default_limits)
VALUES
(
    'plan-free',
    'Plano Free',
    'fixed',
    'Ideal para testes e pequenas automações.',
    0,
    0.50,
    0.05,
    0.10,
    0.10,
    '{"llmTokens": 100000, "messages": 5000, "sttMinutes": 100, "ttsMinutes": 50, "agents": 2, "users": 5}'::JSONB
),
(
    'plan-pro',
    'Plano Pro Professional',
    'fixed',
    'Para empresas em crescimento com volume moderado.',
    499.00,
    0.15,
    0.02,
    0.08,
    0.08,
    '{"llmTokens": 2000000, "messages": 50000, "sttMinutes": 1500, "ttsMinutes": 1000, "agents": 5, "users": 20}'::JSONB
),
(
    'plan-enterprise-flex',
    'Enterprise Flex',
    'enterprise',
    'Escalabilidade total com faturamento baseado em uso (Pay-as-you-go).',
    2499.00,
    0.30,
    0.20,
    0.05,
    0.05,
    '{"llmTokens": 10000000, "messages": 500000, "sttMinutes": 10000, "ttsMinutes": 10000, "agents": 100, "users": 500}'::JSONB
),
(
    'plan-unlimited',
    'Global Unlimited',
    'unlimited',
    'Sem limites para operações globais críticas.',
    9999.00,
    0.08,
    0.005,
    0.04,
    0.04,
    '{"llmTokens": 100000000, "messages": 5000000, "sttMinutes": 100000, "ttsMinutes": 100000, "agents": 1000, "users": 5000}'::JSONB
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    description = EXCLUDED.description,
    base_price = EXCLUDED.base_price,
    llm_token_price = EXCLUDED.llm_token_price,
    message_price = EXCLUDED.message_price,
    stt_minute_price = EXCLUDED.stt_minute_price,
    tts_minute_price = EXCLUDED.tts_minute_price,
    default_limits = EXCLUDED.default_limits;
