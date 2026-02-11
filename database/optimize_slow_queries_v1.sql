-- =============================================
-- PERFORMANCE OPTIMIZATION V1
-- Purpose: Address slow queries identified in Supabase Performance Logs.
-- Description: Adds strategic indexes for Dashboard and Background Jobs.
-- =============================================

-- 1. Accelerate Conversation Dashboard (Filtered by Tenant, Ordered by Date)
-- Pattern: WHERE tenant_id = $5 ORDER BY last_message_at DESC
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_msg 
ON conversations (tenant_id, last_message_at DESC);

-- 2. Accelerate Message Lookup (Inside Lateral Joins)
-- Pattern: WHERE conversation_id = $1 LIMIT $2 OFFSET $3
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages (conversation_id, created_at ASC);

-- 3. Accelerate Consumption Analytics & Billing
-- Pattern: WHERE tenant_id = p_tenant_id GROUP BY agent_id
CREATE INDEX IF NOT EXISTS idx_consumption_metrics_tenant_agg 
ON consumption_metrics (tenant_id, agent_id, metric_type);

-- 4. Accelerate Idle Conversation Cleanup
-- Pattern: WHERE status != 'closed' AND last_message_at < ...
CREATE INDEX IF NOT EXISTS idx_conversations_cleanup_idle 
ON conversations (status, last_message_at) 
WHERE status != 'closed';

-- 5. Accelerate VAPI Integration Sync
-- Pattern: WHERE provider = 'vapi' AND external_id = ...
-- (Already exists in vapi_integration_schema.sql but good to ensure parity)
CREATE INDEX IF NOT EXISTS idx_integration_logs_lookup 
ON integration_logs (provider, external_id, tenant_id);

-- ANALYZE Tables to update statistics
ANALYZE conversations;
ANALYZE messages;
ANALYZE consumption_metrics;
ANALYZE integration_logs;
