-- [OPTIMIZATION] Índices para acelerar o Porteiro e evitar retentativas do Zenvia

-- 1. Acelera busca de Agente pelo canal do Zenvia
CREATE INDEX IF NOT EXISTS idx_agents_zenvia_channel_id ON public.agents(zenvia_channel_id) WHERE zenvia_channel_id IS NOT NULL;

-- 2. Acelera busca de Conversas ativas
CREATE INDEX IF NOT EXISTS idx_conversations_lookup_zenvia ON public.conversations(tenant_id, user_identifier, agent_id, status) WHERE status != 'closed';

-- 3. Acelera busca de mensagens por remote_id (usado nos status updates)
CREATE INDEX IF NOT EXISTS idx_messages_remote_id ON public.messages(remote_id) WHERE remote_id IS NOT NULL;

-- 4. Acelera a fila de entrada para evitar processar a mesma mensagem duas vezes
CREATE INDEX IF NOT EXISTS idx_inbound_queue_external_id ON public.inbound_queue(external_id);
CREATE INDEX IF NOT EXISTS idx_inbound_queue_status_pending ON public.inbound_queue(status) WHERE status = 'pending';
