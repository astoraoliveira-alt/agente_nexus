-- =============================================
-- PERFORMANCE TUNING: Messaging & Conversations
-- Purpose: Optimize slow queries identified in Supabase logs.
-- =============================================

-- 1. INDEX FOR MESSAGE HISTORY (ORDERED)
-- Standard queries filter by conversation_id and sort by created_at.
-- Without this, Postgres might perform a SORT operation on large histories.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_ordered 
ON public.messages(conversation_id, created_at ASC);

-- 2. INDEX FOR CONVERSATION LIST (ORDERED BY TENANT)
-- The dashboard filters by tenant_id and orders by last_message_at.
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_msg 
ON public.conversations(tenant_id, last_message_at DESC);

-- 3. ANALYZE TABLES
-- Help Postgres optimizer by updating statistics.
ANALYZE public.messages;
ANALYZE public.conversations;

DO $$
BEGIN
  RAISE NOTICE 'High-performance indexes applied successfully.';
END $$;
