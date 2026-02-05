-- =============================================
-- Migration: Fix Historical Token Costs
-- Rule: R$ 0.10 per 1k tokens
-- =============================================

-- 1. Update Tokens Cost
UPDATE consumption_metrics
SET cost = (value::NUMERIC / 1000.0) * 0.10
WHERE metric_type = 'tokens';

-- 2. Verify Output (Optional, for you to see)
SELECT id, value, cost FROM consumption_metrics WHERE metric_type = 'tokens' LIMIT 5;
