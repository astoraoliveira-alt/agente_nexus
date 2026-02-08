-- Migration: Consumption Evolution (ROI & Governance) - V3 (Consistent Naming)
-- Adds support for:
-- 1. Consumption Alerts (Thresholds)
-- 2. Cost Centers / Departments for Agents
-- 3. ROI Meta-data for calculating hours saved

-- 1. Create a table for billing alerts
CREATE TABLE IF NOT EXISTS billing_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- Consistency: Column is tenant_id, Table is companies
    metric_type TEXT NOT NULL, -- 'tokens', 'messages', 'cost'
    threshold_percent DECIMAL NOT NULL, -- e.g. 80.0
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add department/cost center to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS department_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cost_center TEXT;

-- 3. Add ROI configuration to companies (avg operator cost and time saved)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS roi_config JSONB DEFAULT '{"avg_human_minutes_per_interaction": 2.5, "operator_hourly_rate": 30.0}';

-- 4. Function to check and trigger alerts (Placeholder for N8N/Edge Function)
COMMENT ON TABLE billing_alerts IS 'Stores threshold triggers for proactive consumption notifications.';
