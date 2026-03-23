-- SQL PARA O MISSION CONTROL - AUDITORIA DE FILA (V7)
CREATE OR REPLACE FUNCTION public.fn_get_queue_audit(
    p_tenant_id uuid DEFAULT NULL,
    p_stuck_minutes int DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    status text,
    created_at timestamptz,
    error_message text,
    agent_name text,
    message_type text,
    external_id text,
    tenant_id uuid,
    payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER -- Permite ver todas as mensagens ignorando RLS
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM (
        SELECT 
            q.id,
            q.status,
            q.created_at,
            q.error_message,
            a.name as agent_name,
            q.message_type,
            q.external_id,
            q.tenant_id,
            q.payload
        FROM public.inbound_queue q
        LEFT JOIN public.agents a ON q.agent_id = a.id
        WHERE 
            (p_tenant_id IS NULL OR q.tenant_id = p_tenant_id)
            AND 
            (q.status IN ('pending', 'processing') AND q.created_at < (NOW() - (p_stuck_minutes || ' minutes')::interval))

        UNION ALL

        SELECT 
            qe.queue_id as id,
            qe.status,
            qe.created_at,
            qe.error_message,
            a.name as agent_name,
            'log' as message_type,
            qe.external_id,
            qe.tenant_id,
            qe.payload
        FROM public.inbound_queue_errors qe
        LEFT JOIN public.agents a ON qe.agent_id = a.id
        WHERE 
            (p_tenant_id IS NULL OR qe.tenant_id = p_tenant_id)
    ) as audit_combined
    ORDER BY created_at DESC
    LIMIT 100;
END;
$$;
