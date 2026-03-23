
-- =============================================== --
-- DAVOS NEXUS - MAESTRO RETRY V7 (REANIMADOR) --
-- Permite reviver qualquer mensagem não concluída --
-- =============================================== --

CREATE OR REPLACE FUNCTION public.fn_retry_failed_message(
    p_queue_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Reseta o status e limpa as travas
    -- Permitimos resetar qualquer coisa que NÃO seja 'done'
    UPDATE public.inbound_queue 
    SET 
        status = 'pending',
        locked_at = NULL,
        processed_at = NULL,
        error_message = NULL,
        processed_count = COALESCE(processed_count, 0) + 1,
        created_at = NOW() -- Opcional: Renovamos a vida para o topo da fila? 
                           -- Talvez não para manter a ordem cronológica, 
                           -- mas aqui garantimos que o supervisor a pegue.
    WHERE id = p_queue_id AND status != 'done';
END;
$$;
