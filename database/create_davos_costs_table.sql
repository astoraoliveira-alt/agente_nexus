-- =============================================
-- Migration: Create Davos Internal Costs Table
-- Purpose: Track what Davos pays for VPS, n8n, VAPI, Twilio, etc.
-- =============================================

CREATE TABLE IF NOT EXISTS company_davos_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_key VARCHAR(50) NOT NULL, -- 'vps', 'n8n', 'vapi_fixed', 'vapi_variable', 'twilio_fixed', 'twilio_variable'
    item_label VARCHAR(255) NOT NULL, -- human readable
    cost_value NUMERIC(10, 4) NOT NULL DEFAULT 0,
    is_recurring BOOLEAN DEFAULT TRUE, -- monthly cost
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, item_key)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_davos_costs_tenant ON company_davos_costs(tenant_id);

-- Commentary
COMMENT ON TABLE company_davos_costs IS 'Stores internal costs paid by Davos for each tenant infrastructure and services.';
