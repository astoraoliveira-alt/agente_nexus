-- 1. Removemos TODAS as possíveis duplicatas de sobrecarga de função
DROP FUNCTION IF EXISTS public.fn_bind_execution(uuid, text);
DROP FUNCTION IF EXISTS public.fn_bind_execution(uuid, character varying);
DROP FUNCTION IF EXISTS public.fn_bind_execution(uuid, varchar);

-- 2. Garantimos que a coluna existe
ALTER TABLE public.inbound_queue 
ADD COLUMN IF NOT EXISTS n8n_execution_id text;

-- 3. Criamos a função definitiva usando apenas TEXT
CREATE OR REPLACE FUNCTION public.fn_bind_execution(
    p_queue_id UUID,
    p_execution_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated JSONB;
BEGIN
    UPDATE public.inbound_queue
    SET 
        n8n_execution_id = p_execution_id,
        status = 'processing'
    WHERE id = p_queue_id
    RETURNING jsonb_build_object(
        'success', true,
        'queue_id', id,
        'n8n_execution_id', n8n_execution_id,
        'trace_id', trace_id
    ) INTO v_updated;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fila não encontrada ou ID inválido');
    END IF;

    RETURN v_updated;
END;
$$;
