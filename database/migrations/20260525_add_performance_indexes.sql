-- =============================================
-- PERFORMANCE OPTIMIZATION: Slow Queries Fix (V66.17)
-- Purpose: Optimize slow queries identified in Supabase logs (get_conversation_establishments, conversations list sorting, get_next_leads_secure, get_conversation_message_counts)
-- Note: Omitted 'CONCURRENTLY' to allow execution in transaction-based environments like Supabase SQL Editor.
-- =============================================

-- 1. Optimize get_conversation_establishments and queries filtering by WhatsApp
CREATE INDEX IF NOT EXISTS idx_agent_leads_tenant_whatsapp 
ON public.agent_leads(tenant_id, whatsapp);

CREATE INDEX IF NOT EXISTS idx_agent_leads_whatsapp 
ON public.agent_leads(whatsapp);

-- 2. Optimize conversations sorting by last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_message 
ON public.conversations(tenant_id, last_message_at DESC NULLS LAST);

-- 3. Optimize get_conversation_message_counts and message grouping by tenant
CREATE INDEX IF NOT EXISTS idx_messages_tenant_conversation 
ON public.messages(tenant_id, conversation_id);

-- 4. Optimize get_next_leads_secure processing safety check
CREATE INDEX IF NOT EXISTS idx_outbound_queue_processing_phone 
ON public.outbound_queue(contact_phone) 
WHERE status = 'processing';
