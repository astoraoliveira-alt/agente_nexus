-- ==============================================================================
-- MIGRATION: 20261015_add_external_message_id_to_outbound_queue.sql
-- Descrição:
--   Resolve o erro 42703 do Postgres ("column outbound_queue.external_message_id does not exist")
--   gerado quando o Porteiro recebe notificações de status de entrega (Zenvia/Evolution)
--   e tenta atualizar o status da fila de saída por ID externo.
-- ==============================================================================

BEGIN;

-- 1. Adicionar coluna external_message_id à tabela outbound_queue se não existir
ALTER TABLE public.outbound_queue 
ADD COLUMN IF NOT EXISTS external_message_id VARCHAR(255);

-- 2. Criar índice parcial de alta performance para buscas rápidas pelo webhook da Zenvia
CREATE INDEX IF NOT EXISTS idx_outbound_queue_external_msg_id 
ON public.outbound_queue(external_message_id) 
WHERE external_message_id IS NOT NULL;

COMMENT ON COLUMN public.outbound_queue.external_message_id IS 'ID externo da mensagem retornado pelo provedor de disparo (Zenvia/Evolution) para correlação de status de entrega.';

COMMIT;

-- Recarregar cache de schema
NOTIFY pgrst, 'reload schema';
