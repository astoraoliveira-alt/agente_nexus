-- =============================================
-- PERFORMANCE AUDIT FIX: Critical Indexes
-- Purpose: Optimize chat history and dashboard lookups
-- Note: Removed 'CONCURRENTLY' to allow execution via Supabase SQL Editor
-- =============================================

-- 1. Optimize Messages Lookup (Chat History)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at 
ON public.messages(conversation_id, created_at DESC);

-- 2. Optimize Conversations by User (Reopen Logic)
CREATE INDEX IF NOT EXISTS idx_conversations_user_identifier 
ON public.conversations(user_identifier);

-- 3. Optimize Consumption Metrics (Dashboard)
CREATE INDEX IF NOT EXISTS idx_consumption_metrics_tenant_recorded 
ON public.consumption_metrics(tenant_id, recorded_at DESC);

-- 4. Optimize Incident Management
CREATE INDEX IF NOT EXISTS idx_incidents_conversation_id 
ON public.incidents(conversation_id);

-- 5. Optimize AI Success Memory (RAG Improvement)
CREATE INDEX IF NOT EXISTS idx_agent_success_memory_meta 
ON public.agent_success_memory(agent_id, score DESC);
