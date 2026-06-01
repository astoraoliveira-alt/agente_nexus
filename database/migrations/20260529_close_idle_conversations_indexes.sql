-- Migration to add performance indexes for close_idle_conversations RPC

-- 1. Index to quickly find active conversations
CREATE INDEX IF NOT EXISTS idx_conversations_status_active 
ON public.conversations (status) 
WHERE status IN ('ai_active', 'human_active');

-- 2. Composite index to optimize the window function (ROW_NUMBER) for active sessions
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_agent_user_created 
ON public.conversations (tenant_id, agent_id, user_identifier, created_at DESC)
WHERE status IN ('ai_active', 'human_active');

-- 3. Index to optimize the LATERAL JOIN on outbound_queue
CREATE INDEX IF NOT EXISTS idx_outbound_queue_conversation_created 
ON public.outbound_queue (conversation_id, created_at DESC);
