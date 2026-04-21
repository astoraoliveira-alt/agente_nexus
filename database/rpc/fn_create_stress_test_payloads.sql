-- 1. MOTOR DE ESTRESSE ISOLADO
CREATE OR REPLACE FUNCTION public.fn_create_stress_test_payloads(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_count integer DEFAULT 10
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_batch_id text;
    v_trace_id text;
    v_conv_id uuid;
    i integer;
BEGIN
    IF p_count > 1000 THEN p_count := 1000; END IF;

    -- Batch ID único para identificar todo o grupo do laboratório
    v_batch_id := 'LAB_' || to_char(now(), 'YYYYMMDD_HH24MISS');

    FOR i IN 1..p_count LOOP
        -- ID único por mensagem para o trace_id (exigência do seu banco)
        v_trace_id := v_batch_id || '_MSG_' || i;

        -- Identificador único para evitar colisão de "unique_active_conversation_per_user"
        -- Usamos um formato que identifica como teste: 999 + timestamp parcial + índice
        DECLARE
            v_user_ident text := '999' || to_char(now(), 'DDHH24MI') || i::text;
        BEGIN
            -- Conversa identificada como laboratório
            INSERT INTO public.conversations (tenant_id, agent_id, user_identifier, channel, status, metadata)
            VALUES (p_tenant_id, p_agent_id, v_user_ident, 'whatsapp', 'ai_active', jsonb_build_object('is_stress_test', true, 'batch_id', v_batch_id))
            RETURNING id INTO v_conv_id;

            PERFORM public.fn_enqueue_inbound_message(
                p_tenant_id, p_agent_id, v_conv_id,
                'ZNV_STRESS_' || v_trace_id,
                jsonb_build_object(
                    'id', v_trace_id,
                    'correlationId', v_trace_id,
                    'type', 'MESSAGE',
                    'channel', 'whatsapp',
                    'direction', 'IN',
                    'phone', v_user_ident, -- ✅ Adicionado no topo para o n8n
                    'message', jsonb_build_object(
                        'from', v_user_ident,
                        'to', 'nexus_lab',
                        'contents', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Stress Test Payload #' || i))
                    )
                ),
                v_trace_id, 
                'conversation'
            );
        END;
    END LOOP;

    RETURN v_batch_id;
END;
$$;

-- 2. FUNÇÃO DE LIMPEZA CIRÚRGICA
CREATE OR REPLACE FUNCTION public.fn_cleanup_stress_test(p_batch_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Apaga erros da fila
    DELETE FROM public.inbound_queue_errors WHERE trace_id LIKE p_batch_id || '%';
    
    -- Apaga itens da fila processados ou pendentes
    DELETE FROM public.inbound_queue WHERE trace_id LIKE p_batch_id || '%';

    -- Apaga conversas criadas pelo teste (identificadas pelo prefixo 999 ou pelo batch_id no metadata)
    DELETE FROM public.conversations 
    WHERE user_identifier LIKE '999%' 
       OR (metadata->>'batch_id') = p_batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_create_stress_test_payloads TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_stress_test TO authenticated, service_role;
