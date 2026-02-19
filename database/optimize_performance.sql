-- =============================================
-- PERFORMANCE OPTIMIZATION: Database & RAG
-- Purpose: Resolve 11s latency in WhatsApp flows.
-- =============================================

-- 1. CHAT MEMORY OPTIMIZATION
-- n8n Postgres Chat Memory uses session_id. Without an index, it performs a sequential scan.
CREATE INDEX IF NOT EXISTS idx_chat_histories_session_id ON public.chat_histories_memory(session_id);

-- 2. VECTOR SEARCH OPTIMIZATION (RAG)
-- Enable HNSW index for fast approximate nearest neighbor search.
-- requires pgvector 0.5.0+
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_embedding_hnsw 
ON public.agent_knowledge 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 3. CONSUMPTION METRICS OPTIMIZATION
-- record_usage RPC filters by tenant, metric_type and date.
DROP INDEX IF EXISTS idx_consumption_tenant_date; -- Replaced by more specific one
CREATE INDEX IF NOT EXISTS idx_consumption_metrics_query 
ON public.consumption_metrics(tenant_id, metric_type, recorded_at);

-- 4. MESSAGES & CONVERSATIONS (Safety check)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_identifier ON public.conversations(user_identifier, tenant_id);

DO $$
BEGIN
  RAISE NOTICE 'Performance optimization indexes applied successfully.';
END $$;
