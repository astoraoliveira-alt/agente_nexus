-- ==============================================================================
-- OTIMIZAÇÃO DE PERFORMANCE: Slow Queries & Gargalos de RLS
-- ==============================================================================

-- 1. Indexação Crítica para Mensagens (900+ chamadas frequentes)
-- O padrão de acesso é sempre filtrar por conversation_id e ordenar por created_at DESC
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
ON public.messages (conversation_id, created_at DESC);

-- 2. Indexação para Logs de Auditoria (Slow Query de 200ms)
-- A query usa ORDER BY id ASC NULLS LAST com paginação
CREATE INDEX IF NOT EXISTS idx_agent_audit_logs_id_asc
ON public.agent_audit_logs (id ASC NULLS LAST);

-- 3. Otimização da Tabela de Conversas (1300+ chamadas)
-- O frontend faz polling pesado ordenando por last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_message
ON public.conversations (tenant_id, last_message_at DESC);

-- 4. Tunagem de RLS para Messages (Evitar recursão e InitPlan lento)
-- Substituir verificação complexa por função estável se possível
-- (Nota: A função get_auth_tenant_id já está otimizada, mas garantimos o índice no tenant_id)
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id
ON public.messages (tenant_id);

-- 5. Indexação para Busca de Memória (RAG)
-- Já criado, mas reforçando para garantir performance na Fase 3
CREATE INDEX IF NOT EXISTS idx_agent_success_memory_tenant_agent
ON public.agent_success_memory (tenant_id, agent_id);

-- 6. Manutenção de Estatísticas (Atualizar planejador do Postgres)
ANALYZE public.messages;
ANALYZE public.conversations;
ANALYZE public.agent_audit_logs;
