-- DAVOS NEXUS - FIX: sync_conversations_timestamp.sql
-- Descrição: Sincroniza last_message_at e cria automação via trigger.

-- 1. Sincronização Retroativa
WITH latest_messages AS (
    SELECT conversation_id, MAX(created_at) as max_date
    FROM public.messages
    GROUP BY conversation_id
)
UPDATE public.conversations c
SET last_message_at = lm.max_date,
    updated_at = NOW()
FROM latest_messages lm
WHERE c.id = lm.conversation_id;

-- 2. Função de Trigger
CREATE OR REPLACE FUNCTION public.fn_sync_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Aplicação do Trigger
DROP TRIGGER IF EXISTS trg_sync_last_message_at ON public.messages;
CREATE TRIGGER trg_sync_last_message_at
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_last_message_at();
