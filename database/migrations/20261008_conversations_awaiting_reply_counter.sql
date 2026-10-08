-- Migration: 20261008_conversations_awaiting_reply_counter.sql
-- Objetivo: Criar contador inteligente de conversas pendentes de retorno (Opção A)
-- 1. Adiciona colunas denormalizadas em public.conversations para rastreamento de última mensagem
-- 2. Atualiza trigger trg_sync_last_message_at para manter direção e remetente em tempo real
-- 3. Cria índice de alta performance e RPC get_conversations_awaiting_reply_count
-- 4. Executa backfill retroativo seguro das conversas ativas onde a última mensagem foi do cliente

DO $$ 
BEGIN
    -- 1. Adicionar colunas se não existirem
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'last_message_sender_type'
    ) THEN
        ALTER TABLE public.conversations ADD COLUMN last_message_sender_type VARCHAR(20) DEFAULT 'agent';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'last_message_direction'
    ) THEN
        ALTER TABLE public.conversations ADD COLUMN last_message_direction VARCHAR(20) DEFAULT 'outbound';
    END IF;
END $$;

-- 2. Atualizar função de trigger para sincronizar remetente e direção em cada mensagem nova
CREATE OR REPLACE FUNCTION public.fn_sync_last_message_at()
RETURNS TRIGGER AS $$
DECLARE
    v_norm_direction VARCHAR(20);
BEGIN
    v_norm_direction := COALESCE(
        NEW.direction,
        CASE WHEN NEW.sender_type = 'user' THEN 'inbound' ELSE 'outbound' END
    );

    UPDATE public.conversations
    SET 
        last_message_at = NEW.created_at,
        last_message_sender_type = COALESCE(NEW.sender_type, CASE WHEN v_norm_direction = 'inbound' THEN 'user' ELSE 'agent' END),
        last_message_direction = v_norm_direction,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir trigger ativo em public.messages
DROP TRIGGER IF EXISTS trg_sync_last_message_at ON public.messages;
CREATE TRIGGER trg_sync_last_message_at
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_last_message_at();

-- 3. Índice para contagem ultrarrápida (sub-milissegundo)
CREATE INDEX IF NOT EXISTS idx_conversations_awaiting_reply
ON public.conversations (tenant_id, status, last_message_direction, last_message_sender_type);

-- 4. RPC Oficial para contagem total e real de conversas aguardando retorno
CREATE OR REPLACE FUNCTION public.get_conversations_awaiting_reply_count(p_tenant_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.conversations
    WHERE tenant_id = p_tenant_id
      AND status != 'closed'
      AND (
        last_message_direction = 'inbound'
        OR last_message_sender_type = 'user'
      );

    RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversations_awaiting_reply_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversations_awaiting_reply_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_conversations_awaiting_reply_count(uuid) TO anon;

-- 5. Backfill retroativo seguro das conversas ativas
-- Atualiza conversas ativas cujo timestamp da última mensagem coincide com a mensagem inbound
WITH latest_inbounds AS (
    SELECT DISTINCT ON (conversation_id)
        conversation_id,
        COALESCE(sender_type, 'user') as sender_type,
        'inbound'::varchar(20) as direction,
        created_at
    FROM public.messages
    WHERE direction = 'inbound' OR sender_type = 'user'
    ORDER BY conversation_id, created_at DESC
)
UPDATE public.conversations c
SET 
    last_message_sender_type = 'user',
    last_message_direction = 'inbound'
FROM latest_inbounds li
WHERE c.id = li.conversation_id
  AND c.status != 'closed'
  AND (c.last_message_at IS NULL OR abs(extract(epoch from (c.last_message_at - li.created_at))) < 3);
