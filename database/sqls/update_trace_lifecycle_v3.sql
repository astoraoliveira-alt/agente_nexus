-- ========================================================== --
-- AUTO-CLEANUP: DISCOVER AND DELETE ALL TRACE OVERLOADS   --
-- ========================================================== --

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT oid::regprocedure as formal_signature
        FROM pg_proc 
        WHERE proname = 'fn_get_trace_lifecycle' 
          AND pronamespace = 'public'::regnamespace
    ) 
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.formal_signature;
        RAISE NOTICE 'Dropped function: %', r.formal_signature;
    END LOOP;
END $$;

-- 2. Versão Elite Legado-Aware + Payload-Fallback (V3.3)
CREATE OR REPLACE FUNCTION public.fn_get_trace_lifecycle(
    p_tenant_id uuid,
    p_identifier text, 
    p_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_phone text;
    v_trace_ids text[];
BEGIN
    -- Limpa o identificador
    v_phone := regexp_replace(p_identifier, '[^0-9]', '', 'g');

    -- 1. Busca os Trace IDs
    SELECT array_agg(DISTINCT trace_id) INTO v_trace_ids
    FROM public.integration_logs
    WHERE tenant_id = p_tenant_id
    AND (
        phone_number LIKE '%' || v_phone
        OR payload->>'phone' LIKE '%' || v_phone
        OR payload->'data'->'key'->>'remoteJid' LIKE v_phone || '%'
        OR trace_id = p_identifier
    )
    AND processed_at::date = p_date;

    IF v_trace_ids IS NULL THEN
        v_trace_ids := ARRAY[p_identifier];
    END IF;

    -- 3. Busca o rastro completo
    RETURN (
        SELECT jsonb_agg(sub)
        FROM (
            SELECT 
                l.id,
                l.status,
                -- Lógica de Latência: Coluna > Payload > Default
                CASE 
                    WHEN l.latency_ms > 0 THEN l.latency_ms || 'ms'
                    WHEN (l.payload->>'latency_ms')::int > 0 THEN (l.payload->>'latency_ms') || 'ms'
                    ELSE '< 1ms'
                END as latency,
                COALESCE(l.latency_ms, (l.payload->>'latency_ms')::int, 0) as latency_raw,
                CASE 
                    WHEN l.provider = 'evolution' AND l.status = 'received' THEN 'WHATSAPP_IN'
                    WHEN l.provider = 'evolution' AND l.status = 'processed' THEN 'PORTEIRO_GATEWAY'
                    WHEN l.provider = 'zenvia' AND l.status = 'received' THEN 'WHATSAPP_IN'
                    WHEN l.provider = 'zenvia' AND l.status = 'processed' THEN 'PORTEIRO_GATEWAY'
                    WHEN l.provider = 'vapi' THEN 'VOICE_CALL'
                    WHEN l.provider = 'outbound' THEN 'AI_BOT'
                    ELSE UPPER(COALESCE(l.provider, 'SISTEMA'))
                END as event_type,
                CASE 
                    WHEN l.provider = 'outbound' AND (l.status = 'sent' OR l.status = 'done') THEN 'RESPOSTA ENVIADA PARA O WHATSAPP'
                    WHEN l.provider = 'outbound' AND l.status = 'failed' THEN 'FALHA AO ENVIAR RESPOSTA'
                    WHEN l.status = 'received' THEN 'SINAL CAPTURADO PELO GATEWAY'
                    WHEN l.status = 'processed' THEN 'MENSAGEM ENFILEIRADA COM SUCESSO'
                    WHEN l.status = 'ignored' THEN 'EVENTO IGNORADO (DUPLICADO OU NÃO SUPORTADO)'
                    ELSE UPPER(l.status)
                END as description,
                COALESCE(l.payload->>'content', l.payload->'message'->>'conversation', 'Sem prévia') as preview_text,
                l.payload as payload,
                l.processed_at as timestamp,
                COALESCE(l.path, l.payload->>'destination', l.payload->>'server_url', '/v1/webhook') as path,
                l.error_details as incident_ref
            FROM public.integration_logs l
            WHERE l.tenant_id = p_tenant_id
            AND l.trace_id = ANY(v_trace_ids)
            ORDER BY l.processed_at ASC
        ) sub
    );
END;
$$;

COMMENT ON FUNCTION public.fn_get_trace_lifecycle IS 'Versão 3.3: Suporte a fallback de latência e caminhos de trânsito direto do payload.';
