-- 1. Integration Logs (Audit Trail)
-- Stores raw payloads from VAPI/N8N for debugging and compliance.
CREATE TABLE IF NOT EXISTS integration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES companies(id),
    provider VARCHAR(50) DEFAULT 'vapi',
    external_id VARCHAR(255), -- vapi.call.id
    payload JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'success', -- success, error
    error_details TEXT
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_provider_ext ON integration_logs(provider, external_id);

-- 2. Messages Update (Idempotency & Ordering)
-- external_order: Enforces strict sequential order (1, 2, 3...) from the source.
-- external_id: Stores the hash or source ID for reference.
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS external_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS external_order INT;

-- Unique Constraint to prevent duplicates (The core of our Idempotency strategy)
-- existing messages have null external_order, so this constraint only affects new synced messages.
ALTER TABLE messages 
DROP CONSTRAINT IF EXISTS messages_conversation_id_external_order_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_order 
ON messages(conversation_id, external_order) 
WHERE external_order IS NOT NULL;


-- 3. Conversations Update (Billing)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
