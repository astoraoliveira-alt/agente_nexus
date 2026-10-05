-- MIGRATION: 20261005_fix_campaign_status_enum_in_abandonment_candidates.sql
-- Objetivo:
-- 1. Corrigir erro de enum campaign_status com cast explícito c.status::text.
-- 2. Corrigir incompatibilidade de tipos de start_time/end_time com NULLIF(c.start_time, '')::time.
-- 3. Corrigir erro de enum conversation_status com cast explícito conv.status::text.
-- 4. BLINDAGEM DE ABANDONO REAL: Exigir oq.response_detected = true e mensagem real do cliente
--    (m_user.sender_type = 'user' ou direction = 'inbound') para nunca pegar leads frios que nunca responderam.

CREATE OR REPLACE FUNCTION public.get_funnel_abandonment_candidates(
    p_agent_id UUID DEFAULT NULL,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now_sp TIMESTAMP := NOW() AT TIME ZONE 'America/Sao_Paulo';
    v_dow INT := EXTRACT(ISODOW FROM v_now_sp); -- 1 = Segunda, 5 = Sexta, 6 = Sábado, 7 = Domingo
    v_time_sp TIME := v_now_sp::time;
    v_candidates JSONB := '[]'::jsonb;
    v_agent RECORD;
    v_campaign RECORD;
    v_target RECORD;
    v_last_msg RECORD;
    v_msgs_json JSONB;
    v_company_name TEXT;
    v_contact_name TEXT;
    v_delay_interval INTERVAL;
    v_current_attempts INT;
BEGIN
    -- [REGRA 1]: Desconsiderar finais de semana (Sábado = 6, Domingo = 7)
    IF v_dow > 5 THEN
        RETURN jsonb_build_object(
            'success', true,
            'candidates_count', 0,
            'candidates', '[]'::jsonb,
            'reason', 'Finais de semana bloqueados para envio de follow-up (Segunda a Sexta apenas).'
        );
    END IF;

    -- Iterar pelos agentes que possuem a funcionalidade ativada
    FOR v_agent IN 
        SELECT 
            a.id, 
            a.tenant_id, 
            a.name,
            COALESCE(a.funnel_followup_delay_minutes, 30) as delay_minutes,
            LEAST(GREATEST(COALESCE(a.funnel_followup_max_attempts, 1), 1), 3) as max_attempts
        FROM public.agents a
        WHERE a.funnel_followup_enabled = true
          AND (p_agent_id IS NULL OR a.id = p_agent_id)
          AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    LOOP
        v_delay_interval := (v_agent.delay_minutes || ' minutes')::interval;

        -- Iterar pelas campanhas ativas desse agente (cast ::text no status e no horário)
        FOR v_campaign IN
            SELECT 
                c.id as campaign_id,
                c.tenant_id,
                c.name as campaign_name,
                c.start_time,
                c.end_time
            FROM public.campaigns c
            WHERE c.agent_id = v_agent.id
              AND c.status::text IN ('active', 'running', 'processing')
              AND (
                  (c.start_time IS NULL AND c.end_time IS NULL)
                  OR 
                  (v_time_sp >= COALESCE(NULLIF(c.start_time, '')::time, '08:00:00'::time) 
                   AND v_time_sp <= COALESCE(NULLIF(c.end_time, '')::time, '20:00:00'::time))
              )
        LOOP
            -- Buscar conversas candidatas que pararam no funil
            FOR v_target IN
                SELECT 
                    conv.id as conversation_id,
                    conv.user_identifier,
                    conv.user_name,
                    conv.metadata as conv_metadata,
                    conv.last_message_at,
                    oq.id as queue_id,
                    oq.contact_name,
                    oq.contact_phone,
                    oq.metadata as oq_metadata
                FROM public.conversations conv
                JOIN public.outbound_queue oq 
                  ON oq.conversation_id = conv.id 
                 AND oq.campaign_id = v_campaign.campaign_id
                WHERE conv.tenant_id = v_campaign.tenant_id
                  AND conv.agent_id = v_agent.id
                  AND conv.status::text IN ('ai_active', 'active', 'open')
                  -- Não pode estar em atendimento humano
                  AND conv.assigned_operator_id IS NULL
                  -- Não pode estar em incidente
                  AND (conv.metadata->>'incident_mode' IS NULL OR conv.metadata->>'incident_mode' = 'false')
                  -- 🛡️ BLINDAGEM DE ABANDONO REAL: O lead PRECISA ter interagido e falado no chat
                  AND oq.response_detected = true
                  AND COALESCE((oq.metadata->>'is_auto_reply')::boolean, false) = false
                  AND EXISTS (
                      SELECT 1 FROM public.messages m_user 
                      WHERE m_user.conversation_id = conv.id 
                        AND (m_user.sender_type = 'user' OR m_user.direction = 'inbound')
                  )
                  -- EXCLUSÃO DEFINITIVA: Se em qualquer momento houve recusa, formalização ou desinteresse
                  AND NOT EXISTS (
                      SELECT 1 FROM public.messages m_hist
                      WHERE m_hist.conversation_id = conv.id
                        AND (
                            m_hist.content ILIKE '%não foi aprovada%'
                            OR m_hist.content ILIKE '%nao foi aprovada%'
                            OR m_hist.content ILIKE '%não conseguimos liberar%'
                            OR m_hist.content ILIKE '%nao conseguimos liberar%'
                            OR m_hist.content ILIKE '%políticas internas de crédito%'
                            OR m_hist.content ILIKE '%politicas internas de credito%'
                            OR m_hist.content ILIKE '%30 dias%'
                            OR m_hist.content ILIKE '%comitê fiserv%'
                            OR m_hist.content ILIKE '%comite fiserv%'
                            OR m_hist.content ILIKE '%já está em analise%'
                            OR m_hist.content ILIKE '%já está em análise%'
                            OR m_hist.content ILIKE '%avaliando em ~1 minuto%'
                            OR m_hist.content ILIKE '%assessor entre em contato%'
                            OR m_hist.content ILIKE '%atendimento humano%'
                            OR m_hist.content ILIKE '%simulação concluída%'
                            OR m_hist.content ILIKE '%simulacao concluida%'
                            OR m_hist.content ILIKE '%crédito aprovado%'
                            OR m_hist.content ILIKE '%formalização%'
                            OR m_hist.content ILIKE '%compreendo perfeitamente%'
                            OR m_hist.content ILIKE '%caso precise de reforço de caixa no futuro%'
                            OR m_hist.content ILIKE '%se mudar de ideia, é só me chamar%'
                            OR m_hist.content ILIKE '%só podemos seguir com a análise de crédito se você aceitar%'
                        )
                  )
                  -- Inatividade mínima atingida
                  AND conv.last_message_at <= (NOW() - v_delay_interval)
                  -- Regra das 24 Horas: campanha e atividade iniciadas no mesmo dia
                  AND conv.last_message_at >= (NOW() - INTERVAL '24 hours')
                  AND oq.sent_at >= (NOW() - INTERVAL '24 hours')
                  -- Não enfileirar se a fila já estiver pendente ou em processamento
                  AND oq.status NOT IN ('pending', 'processing')
                ORDER BY conv.last_message_at ASC
                LIMIT 50
            LOOP
                -- Quantas tentativas de follow-up já foram feitas para esta conversa?
                v_current_attempts := COALESCE((v_target.conv_metadata->>'funnel_followup_attempt_count')::int, 0);

                -- Limite de envios configurado no agente (máximo 1, 2 ou 3)
                IF v_current_attempts >= v_agent.max_attempts THEN
                    CONTINUE;
                END IF;

                -- Cooldown entre tentativas
                IF v_current_attempts > 0 THEN
                    IF (v_target.conv_metadata->>'funnel_followup_last_sent_at') IS NOT NULL THEN
                        IF (v_target.conv_metadata->>'funnel_followup_last_sent_at')::timestamptz > (NOW() - v_delay_interval) THEN
                            CONTINUE;
                        END IF;
                    END IF;
                END IF;

                -- Verificar a última mensagem do chat: deve ter sido enviada pela Sofia (bot)
                SELECT m.sender_type, m.direction, m.content, m.created_at
                INTO v_last_msg
                FROM public.messages m
                WHERE m.conversation_id = v_target.conversation_id
                ORDER BY m.created_at DESC
                LIMIT 1;

                IF v_last_msg.sender_type = 'user' OR v_last_msg.direction = 'inbound' THEN
                    -- O cliente acabou de responder ou falou por último! Não enviar follow-up.
                    CONTINUE;
                END IF;

                -- Buscar histórico recente da conversa (últimas 8 mensagens) formatadas
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'sender', CASE 
                            WHEN m_sub.sender_type IN ('assistant', 'bot', 'agent', 'ai', 'outbound') THEN 'Sofia'
                            ELSE 'Cliente'
                        END,
                        'content', m_sub.content,
                        'created_at', m_sub.created_at
                    ) ORDER BY m_sub.created_at ASC
                )
                INTO v_msgs_json
                FROM (
                    SELECT m.sender_type, m.content, m.created_at
                    FROM public.messages m
                    WHERE m.conversation_id = v_target.conversation_id
                    ORDER BY m.created_at DESC
                    LIMIT 8
                ) m_sub;

                -- Identificar Razão Social / Empresa
                v_company_name := COALESCE(
                    v_target.oq_metadata->>'empresa', 
                    v_target.oq_metadata->>'company_name', 
                    v_target.oq_metadata->>'razao_social',
                    v_target.user_name,
                    'sua empresa'
                );

                v_contact_name := COALESCE(v_target.contact_name, v_target.user_name, '');

                v_candidates := v_candidates || jsonb_build_object(
                    'queue_id', v_target.queue_id,
                    'conversation_id', v_target.conversation_id,
                    'phone', v_target.contact_phone,
                    'contact_name', v_contact_name,
                    'company_name', v_company_name,
                    'tenant_id', v_campaign.tenant_id,
                    'campaign_id', v_campaign.campaign_id,
                    'agent_id', v_agent.id,
                    'current_attempts', v_current_attempts,
                    'last_bot_message', v_last_msg.content,
                    'messages_history', COALESCE(v_msgs_json, '[]'::jsonb)
                );
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'candidates_count', jsonb_array_length(v_candidates),
        'candidates', v_candidates,
        'timestamp', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_funnel_abandonment_candidates(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_abandonment_candidates(UUID, UUID) TO service_role;
