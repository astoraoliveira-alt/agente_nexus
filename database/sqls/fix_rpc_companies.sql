-- =============================================
-- FIX: get_companies_overview (Syntax and Casing)
-- Description: Fixes missing FROM clause and ensures camelCase 
-- for easier consumption in React frontend.
-- =============================================

DROP FUNCTION IF EXISTS get_companies_overview();

CREATE OR REPLACE FUNCTION get_companies_overview()
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    slug VARCHAR,
    status VARCHAR,
    plan_tier VARCHAR,
    created_at TIMESTAMPTZ,
    privacy_settings JSONB,
    plan_details JSONB,
    agents_count BIGINT,
    users_count BIGINT,
    total_tokens NUMERIC,
    total_messages BIGINT,
    plan_prices JSONB,
    plan_name VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name::VARCHAR,
        c.slug::VARCHAR,
        c.status::VARCHAR,
        c.plan_tier::VARCHAR,
        c.created_at,
        c.privacy_settings,
        c.plan_details,
        (SELECT COUNT(*) FROM agents a WHERE a.tenant_id = c.id) as agents_count,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = c.id) as users_count,
        COALESCE((
            SELECT SUM(cm.value) 
            FROM consumption_metrics cm 
            WHERE cm.tenant_id = c.id 
            AND cm.metric_type = 'tokens'
        ), 0) as total_tokens,
        COALESCE((
            SELECT COUNT(*) 
            FROM messages m 
            WHERE m.tenant_id = c.id
        ), 0) as total_messages,
        (
            SELECT jsonb_build_object(
                'basePrice', p.base_price,
                'llmTokenPrice', p.llm_token_price,
                'messagePrice', p.message_price,
                'sttMinutePrice', p.stt_minute_price,
                'ttsMinutePrice', p.tts_minute_price
            )
            FROM plans p
            WHERE p.id = c.plan_tier
            LIMIT 1
        ) as plan_prices,
        (SELECT p.name::VARCHAR FROM plans p WHERE p.id = c.plan_tier) as plan_name
    FROM companies c
    ORDER BY c.name;
END;
$$;

-- Ensure Davos plan is set correctly to 0.50/0.50
UPDATE plans SET 
    stt_minute_price = 0.50, 
    tts_minute_price = 0.50 
WHERE id = 'plan-unlimited';
