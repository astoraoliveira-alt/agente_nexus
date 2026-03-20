-- =============================================== --
-- DAVOS NEXUS - SUPERVISOR DE FILA (O MAESTRO) --
-- =============================================== --

CREATE OR REPLACE FUNCTION public.fn_fetch_next_inbound_message()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record record;
    v_context jsonb;
BEGIN
    -- 1. BUSCA E TRAVA A PRÓXIMA MENSAGEM (Elite Logic)
    UPDATE public.inbound_queue q
    SET status = 'processing', 
        locked_at = NOW(),
        queue_time = NOW() - q.created_at -- Calcula tempo de espera na fila
    WHERE q.id = (
      SELECT q1.id FROM public.inbound_queue q1
      WHERE q1.status IN ('pending', 'failed')
      -- 2.2 Retry Control
      AND (q1.next_retry_at IS NULL OR q1.next_retry_at <= NOW())
      
      -- 3.1 Garantia de NÃO processar mensagens em paralelo na mesma conversa
      AND NOT EXISTS (
        SELECT 1 FROM public.inbound_queue q2 
        WHERE q2.conversation_id = q1.conversation_id 
        AND q2.status = 'processing'
      )
      
      -- 3.1 Garantia de NÃO pular mensagens (Mensagem 1 antes da 2)
      AND q1.sequence_number = (
        SELECT MIN(sequence_number) FROM public.inbound_queue q3
        WHERE q3.conversation_id = q1.conversation_id
        AND q3.status IN ('pending', 'failed')
      )
      
      ORDER BY priority DESC, sequence_number ASC, created_at ASC 
      LIMIT 1 
      FOR UPDATE SKIP LOCKED
    )
    RETURNING * INTO v_record;

    -- Se não encontrou mensagem para processar
    IF v_record.id IS NULL THEN
        return NULL;
    END IF;

    -- 2. CARREGA O CONTEXTO (Elite Integration)
    -- Chamamos a função de governança pesada aqui no banco para o n8n já receber tudo pronto
    -- Parâmetros baseados no payload salvo pelo Porteiro
    SELECT public.fn_get_agent_context(
        v_record.payload->>'instance', 
        v_record.payload->>'phone', 
        v_record.payload->>'name', 
        COALESCE(v_record.payload->'metadata', '{}'::jsonb)
    ) INTO v_context;

    -- 3. VALIDA BLOQUEIO DE GOVERNANÇA
    -- Se a função retornar bloqueado (empresa inativa, usuário banido, etc)
    IF v_context->>'status' = 'blocked' THEN
        UPDATE public.inbound_queue 
        SET status = 'done', 
            processed_at = NOW(),
            error_message = 'Blocked by Governance: ' || (v_context->'governance'->>'message')
        WHERE id = v_record.id;
        
        -- Retornamos um sinal para o n8n ignorar, ou recursivamente tentamos o próximo?
        -- Por segurança, retornamos o bloqueio para o n8n registrar o log se quiser
    END IF;

    -- 4. ATUALIZA A FILA COM O CONTEXTO CARREGADO (Audit Trail)
    UPDATE public.inbound_queue 
    SET context = v_context 
    WHERE id = v_record.id;

    -- 5. RETORNO CONSOLIDADO PARA O N8N
    RETURN jsonb_build_object(
        'queue_id', v_record.id,
        'tenant_id', v_record.tenant_id,
        'agent_id', v_record.agent_id,
        'conversation_id', v_record.conversation_id,
        'sequence_number', v_record.sequence_number,
        'payload', v_record.payload,
        'context', v_context,
        'metrics', jsonb_build_object(
            'queue_time_seconds', EXTRACT(EPOCH FROM (NOW() - v_record.created_at))
        )
    );
END;
$$;

-- 6. ZELADOR (JANITOR): Limpeza de Mensagens Travadas (Elite 2.4 & 2.6)
CREATE OR REPLACE FUNCTION public.fn_cleanup_stuck_inbound_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Destrava mensagens paradas há mais de 5 minutos (Ex: Worker caiu)
    UPDATE public.inbound_queue
    SET status = 'pending',
        retry_count = retry_count + 1,
        locked_at = NULL,
        next_retry_at = NOW() + INTERVAL '1 minute', -- Espera 1 min antes de tentar de novo
        error_message = 'Unlocked by Janitor: Process timed out.'
    WHERE status = 'processing'
    AND locked_at < NOW() - INTERVAL '5 minutes';

    -- 2. Move para 'dead' mensagens que falharam persistentemente
    UPDATE public.inbound_queue
    SET status = 'dead',
        error_message = 'Max retries (5) exceeded. Moved to dead-letter queue.'
    WHERE (status = 'pending' OR status = 'failed')
    AND retry_count >= 5;
END;
$$;

-- 7. FINALIZADOR (FINISHER): Marca como concluído e salva métricas (Elite 3.2)
CREATE OR REPLACE FUNCTION public.fn_finish_inbound_message(
    p_queue_id uuid,
    p_status text,
    p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.inbound_queue
    SET status = p_status,
        processed_at = NOW(),
        processing_time = NOW() - locked_at, -- Calcula tempo que a IA levou
        error_message = p_error_message
    WHERE id = p_queue_id;
END;
$$;

-- ========================================== --
-- FIM DO SUPERVISOR, ZELADOR E FINALIZADOR   --
-- ========================================== --
