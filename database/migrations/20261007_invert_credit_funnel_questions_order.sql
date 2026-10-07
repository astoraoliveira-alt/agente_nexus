-- ==============================================================================
-- Migration: 20261007_invert_credit_funnel_questions_order.sql
-- Descrição: 
-- 1. Atualiza a RPC 'enqueue_funnel_abandonment_followups' para a nova jornada V29:
--    - Pergunta 1: Valor desejado com nome e CNPJ mascarado (coleta_valor)
--    - Pergunta 2: Faturamento médio mensal (coleta_faturamento)
-- 2. Atualiza os templates e mensagens de follow-up contextual de acordo.
-- 3. Atualiza o blueprint dos agentes de crédito para apontar a nova sequência.
-- ==============================================================================

-- 1. DROPS DEFENSIVOS PARA EVITAR ERRO 42P13 (cannot change return type)
DROP FUNCTION IF EXISTS public.enqueue_funnel_abandonment_followups();
DROP FUNCTION IF EXISTS public.enqueue_funnel_abandonment_followups(UUID);
DROP FUNCTION IF EXISTS public.enqueue_funnel_abandonment_followups(UUID, UUID);

-- 2. RECRIAR RPC COM RETORNO JSONB (COMPATÍVEL COM N8N)
CREATE OR REPLACE FUNCTION public.enqueue_funnel_abandonment_followups(
    p_agent_id UUID DEFAULT NULL,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_now_sp TIMESTAMP := NOW() AT TIME ZONE 'America/Sao_Paulo';
    v_dow INT := EXTRACT(ISODOW FROM v_now_sp); -- 1 = Segunda, 5 = Sexta, 6 = Sábado, 7 = Domingo
    v_time_sp TIME := v_now_sp::time;
    v_enqueued_count INT := 0;
    v_enqueued_leads JSONB := '[]'::jsonb;
    v_agent RECORD;
    v_campaign RECORD;
    v_target RECORD;
    v_last_msg RECORD;
    v_step TEXT;
    v_first_name TEXT;
    v_company_name TEXT;
    v_followup_message TEXT;
    v_interactive_buttons JSONB;
    v_current_attempts INT;
    v_delay_interval INTERVAL;
BEGIN
    -- [REGRA 3]: Desconsiderar finais de semana (Sábado = 6, Domingo = 7)
    IF v_dow > 5 THEN
        RETURN jsonb_build_object(
            'success', true,
            'enqueued_count', 0,
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

        -- Iterar pelas campanhas ativas desse agente
        FOR v_campaign IN
            SELECT 
                c.id as campaign_id,
                c.tenant_id,
                c.name as campaign_name,
                COALESCE(c.start_time::time, '08:00:00'::time) as start_time,
                COALESCE(c.end_time::time, '19:00:00'::time) as end_time
            FROM public.campaigns c
            WHERE c.agent_id = v_agent.id
              AND c.status = 'active'
              -- [REGRA DE CAMPANHA DO MESMO DIA]: Só considera campanhas disparadas hoje
              AND (
                  c.start_date = (v_now_sp)::date
                  OR (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (v_now_sp)::date
              )
              -- [REGRA DE 24 HORAS]: Apenas dentro das 24 horas iniciais do disparo da campanha
              AND c.created_at >= (NOW() - INTERVAL '24 hours')
        LOOP
            -- Respeitar estritamente o horário configurado na campanha
            IF v_time_sp < v_campaign.start_time OR v_time_sp > v_campaign.end_time THEN
                CONTINUE; -- Fora do horário comercial da campanha
            END IF;

            -- Buscar conversas paradas que pertencem a essa campanha
            FOR v_target IN
                SELECT 
                    conv.id as conversation_id,
                    conv.tenant_id,
                    conv.agent_id,
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
                  AND conv.status = 'ai_active'
                  -- O cliente precisa ter respondido pelo menos uma vez
                  AND EXISTS (
                      SELECT 1 FROM public.messages m_user
                      WHERE m_user.conversation_id = conv.id
                        AND m_user.sender_type = 'user'
                        AND m_user.direction = 'inbound'
                  )
                  -- Bloqueio estrito histórico
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
                  AND conv.last_message_at <= (NOW() - v_delay_interval)
                  AND conv.last_message_at >= (NOW() - INTERVAL '24 hours')
                  AND oq.sent_at >= (NOW() - INTERVAL '24 hours')
                  AND oq.status NOT IN ('pending', 'processing')
                ORDER BY conv.last_message_at ASC
                LIMIT 50
            LOOP
                v_current_attempts := COALESCE((v_target.conv_metadata->>'funnel_followup_attempt_count')::int, 0);

                IF v_current_attempts >= v_agent.max_attempts THEN
                    CONTINUE;
                END IF;

                IF v_current_attempts > 0 THEN
                    IF (v_target.conv_metadata->>'funnel_followup_last_sent_at') IS NOT NULL THEN
                        IF (v_target.conv_metadata->>'funnel_followup_last_sent_at')::timestamptz > (NOW() - v_delay_interval) THEN
                            CONTINUE;
                        END IF;
                    END IF;
                END IF;

                -- Verificar última mensagem do chat
                SELECT m.sender_type, m.direction, m.content, m.created_at
                INTO v_last_msg
                FROM public.messages m
                WHERE m.conversation_id = v_target.conversation_id
                ORDER BY m.created_at DESC
                LIMIT 1;

                IF v_last_msg.sender_type = 'user' OR v_last_msg.direction = 'inbound' THEN
                    CONTINUE;
                END IF;

                IF v_last_msg.content ILIKE '%avaliação do comitê fiserv%'
                   OR v_last_msg.content ILIKE '%infelizmente não conseguimos liberar%'
                   OR v_last_msg.content ILIKE '%avaliando em ~1 minuto%'
                   OR v_last_msg.content ILIKE '%solicitação já está em analise%'
                   OR v_last_msg.content ILIKE '%assessor entre em contato%'
                   OR v_last_msg.content ILIKE '%atendimento humano%'
                   OR v_last_msg.content ILIKE '%crédito aprovado%'
                   OR v_last_msg.content ILIKE '%formalização%'
                   OR v_last_msg.content ILIKE '%compreendo perfeitamente%'
                   OR v_last_msg.content ILIKE '%caso precise de reforço de caixa no futuro%'
                   OR v_last_msg.content ILIKE '%se mudar de ideia, é só me chamar%'
                   OR v_last_msg.content ILIKE '%só podemos seguir com a análise de crédito se você aceitar%' THEN
                    CONTINUE;
                END IF;

                -- Identificar etapa (V29: Valor antes de Faturamento)
                v_step := 'geral';
                IF v_last_msg.content ILIKE '%faturamento%' 
                   OR v_last_msg.content ILIKE '%faturamento médio%' 
                   OR v_last_msg.content ILIKE '%melhor condição disponível%' THEN
                    v_step := 'coleta_faturamento';
                ELSIF v_last_msg.content ILIKE '%valor aproximado%' 
                   OR v_last_msg.content ILIKE '%deseja solicitar%' 
                   OR v_last_msg.content ILIKE '%solicitar nessa análise%' 
                   OR v_last_msg.content ILIKE '%valor mínimo%' THEN
                    v_step := 'coleta_valor';
                ELSIF v_last_msg.content ILIKE '%termo de autorização%'
                   OR v_last_msg.content ILIKE '%autorizo o tratamento%'
                   OR v_last_msg.content ILIKE '%scr/bacen%'
                   OR v_last_msg.content ILIKE '%autorização%'
                   OR v_last_msg.content ILIKE '%autorizo%' THEN
                    v_step := 'consentimento_optin';
                ELSIF v_last_msg.content ILIKE '%responsável pelo cnpj%'
                   OR v_last_msg.content ILIKE '%confirmar: estou falando%'
                   OR v_last_msg.content ILIKE '%cnpj%' THEN
                    v_step := 'verificacao_cnpj';
                END IF;

                -- Nome da empresa e contato
                v_company_name := COALESCE(
                    v_target.oq_metadata->>'empresa', 
                    v_target.oq_metadata->>'company_name', 
                    v_target.oq_metadata->>'razao_social',
                    v_target.user_name,
                    'sua empresa'
                );

                v_first_name := split_part(trim(regexp_replace(COALESCE(v_target.user_name, v_target.contact_name, ''), '^[0-9\.\/\-\s]+', '')), ' ', 1);
                IF v_first_name IS NULL OR length(v_first_name) < 2 THEN
                    v_first_name := split_part(trim(regexp_replace(v_company_name, '^[0-9\.\/\-\s]+', '')), ' ', 1);
                END IF;
                IF v_first_name IS NULL OR length(v_first_name) < 2 THEN
                    v_first_name := 'parceiro';
                ELSE
                    v_first_name := initcap(lower(v_first_name));
                END IF;

                -- Mensagens de follow-up V29
                IF v_step = 'coleta_valor' THEN
                    v_followup_message := 'Olá, ' || v_first_name || '! Vi que iniciamos a simulação para a ' || v_company_name || '. Qual valor aproximado você gostaria de solicitar nessa análise? (Temos limites entre 10 e 500 mil reais).';
                    v_interactive_buttons := NULL;
                ELSIF v_step = 'coleta_faturamento' THEN
                    v_followup_message := 'Olá, ' || v_first_name || '! Já registrei o valor que você gostaria de solicitar para a ' || v_company_name || '. Falta apenas uma estimativa aproximada do seu faturamento médio mensal atual (ex: 80 mil) para liberarmos as opções de taxa!';
                    v_interactive_buttons := NULL;
                ELSIF v_step = 'consentimento_optin' THEN
                    v_followup_message := 'Olá, ' || v_first_name || '! Sua proposta para a ' || v_company_name || ' já está pré-analisada. Para calcularmos as taxas e prazos liberados sem compromisso, você autoriza a consulta?';
                    v_interactive_buttons := jsonb_build_object(
                        'tipo', 'botoes',
                        'opcoes', jsonb_build_array('✅ SIM, AUTORIZO', 'Não')
                    );
                ELSIF v_step = 'verificacao_cnpj' THEN
                    v_followup_message := 'Olá, ' || v_first_name || '! Vi que você se interessou pelo Capital de Giro para a ' || v_company_name || ', mas não confirmamos os dados iniciais. Gostaria de simular as condições sem compromisso?';
                    v_interactive_buttons := jsonb_build_object(
                        'tipo', 'botoes',
                        'opcoes', jsonb_build_array('Sim', 'Não')
                    );
                ELSE
                    v_followup_message := 'Olá, ' || v_first_name || '! Vi que iniciamos a simulação de crédito para a ' || v_company_name || '. Gostaria de continuar de onde paramos para conferir os valores liberados?';
                    v_interactive_buttons := jsonb_build_object(
                        'tipo', 'botoes',
                        'opcoes', jsonb_build_array('Sim', 'Não')
                    );
                END IF;

                -- Enfileirar no outbound_queue
                UPDATE public.outbound_queue
                SET 
                    status = 'pending',
                    scheduled_at = NOW(),
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'content', v_followup_message,
                        'is_funnel_followup', true,
                        'funnel_step', v_step,
                        'followup_attempt', v_current_attempts + 1,
                        'interactive_buttons', v_interactive_buttons
                    )
                WHERE id = v_target.queue_id;

                -- Atualizar conversa
                UPDATE public.conversations
                SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'funnel_followup_attempt_count', v_current_attempts + 1,
                    'funnel_followup_last_sent_at', NOW(),
                    'funnel_followup_last_step', v_step
                )
                WHERE id = v_target.conversation_id;

                v_enqueued_count := v_enqueued_count + 1;
                v_enqueued_leads := v_enqueued_leads || jsonb_build_object(
                    'conversation_id', v_target.conversation_id,
                    'phone', v_target.contact_phone,
                    'step', v_step,
                    'attempt', v_current_attempts + 1,
                    'has_buttons', (v_interactive_buttons IS NOT NULL),
                    'buttons', (v_interactive_buttons->'opcoes'),
                    'message', v_followup_message
                );
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'enqueued_count', v_enqueued_count,
        'leads', v_enqueued_leads,
        'timestamp', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_funnel_abandonment_followups(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_funnel_abandonment_followups(UUID, UUID) TO service_role;

-- Sobrecarga sem parâmetros para compatibilidade com chamadas PostgREST sem body ou com body {}
CREATE OR REPLACE FUNCTION public.enqueue_funnel_abandonment_followups()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.enqueue_funnel_abandonment_followups(NULL::uuid, NULL::uuid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_funnel_abandonment_followups() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_funnel_abandonment_followups() TO service_role;

-- 3. ATUALIZAR WORKFLOW BLUEPRINT DOS AGENTES DE CRÉDITO
UPDATE public.agents
SET workflow_blueprint = jsonb_set(
    jsonb_set(
        jsonb_set(
            workflow_blueprint,
            '{steps,start,allowed_next}',
            '["coleta_valor"]'::jsonb
        ),
        '{steps,coleta_valor,allowed_next}',
        '["coleta_faturamento"]'::jsonb
    ),
    '{steps,coleta_faturamento,allowed_next}',
    '["consentimento_optin", "aguardando_fiserv"]'::jsonb
)
WHERE workflow_blueprint IS NOT NULL 
  AND workflow_blueprint ? 'steps'
  AND workflow_blueprint->'steps' ? 'coleta_faturamento';
