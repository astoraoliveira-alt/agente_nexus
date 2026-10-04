-- ==============================================================================
-- Migration: Add Funnel Follow-up (Anti-Abandonment) and Enqueue RPC
-- Date: 2026-10-02
-- Purpose:
--   1. Add configurable follow-up columns on public.agents (enabled, delay, attempts).
--   2. Update get_next_leads_secure to support funnel follow-up leads without
--      being blocked by the CLIENT_RESPONDED conversion filter.
--   3. Create RPC enqueue_funnel_abandonment_followups for n8n cron triggers,
--      respecting business days (Mon-Fri), campaign hours, and step-specific copies.
-- ==============================================================================

-- 1. ADICIONAR COLUNAS NA TABELA AGENTS
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS funnel_followup_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS funnel_followup_delay_minutes INTEGER DEFAULT 30;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS funnel_followup_max_attempts INTEGER DEFAULT 1;

-- Trava de segurança: máximo 3 tentativas por cliente
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS chk_agents_funnel_followup_max_attempts;
ALTER TABLE public.agents ADD CONSTRAINT chk_agents_funnel_followup_max_attempts 
    CHECK (funnel_followup_max_attempts >= 1 AND funnel_followup_max_attempts <= 3);

COMMENT ON COLUMN public.agents.funnel_followup_enabled IS 'Ativa ou desativa a recuperação proativa de abandono no funil.';
COMMENT ON COLUMN public.agents.funnel_followup_delay_minutes IS 'Tempo de inatividade em minutos (ex: 15 ou 30) antes de enviar o follow-up.';
COMMENT ON COLUMN public.agents.funnel_followup_max_attempts IS 'Número máximo de tentativas de follow-up por cliente (1 a 3).';

-- 2. ATUALIZAR get_next_leads_secure PARA SUPORTAR FOLLOW-UP DE ABANDONO
CREATE OR REPLACE FUNCTION public.get_next_leads_secure(
    p_tenant_id uuid,
    p_campaign_id uuid,
    p_limit int
)
RETURNS TABLE (
    id uuid,
    phone text,
    contact_name text,
    campaign_id uuid,
    agent_id uuid,
    tenant_id uuid,
    message text,
    provider text,
    instance text,
    evolution_token text,
    meta_api_token text,
    meta_phone_number_id text,
    zenvia_api_token text,
    zenvia_channel_id text,
    template_id text,
    cta_link text,
    zenvia_image_url text,
    campaign_metadata jsonb,
    lead_metadata jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_daily_limit int;
    v_sent_today int;
    v_allowed_now boolean;
    v_actual_limit int;
    v_capping JSONB;
BEGIN
    -- [A] AUTO-RECUPERAÇÃO: Limpa leads presos no "processing" (> 30 mins)
    UPDATE public.outbound_queue oq_recover
    SET status = 'pending'
    WHERE oq_recover.tenant_id = p_tenant_id
      AND oq_recover.campaign_id = p_campaign_id
      AND oq_recover.status = 'processing'
      AND oq_recover.last_attempt_at < (NOW() - INTERVAL '30 minutes');

    -- 1. Buscar configurações e verificar janela
    SELECT 
        camp.daily_limit,
        camp.capping_config,
        (
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::date >= COALESCE(camp.start_date, '2000-01-01'::date) AND 
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::date <= COALESCE(camp.end_date, (camp.start_date::date + INTERVAL '14 days')::date, '2099-12-31'::date) AND
            ((NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 minute')::time >= COALESCE(camp.start_time::text, '00:00:00')::time AND 
            ((NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 minute')::time <= COALESCE(camp.end_time::text, '23:59:59')::time
        )
    INTO v_daily_limit, v_capping, v_allowed_now
    FROM public.campaigns camp
    WHERE camp.id = p_campaign_id AND camp.status = 'active';

    IF NOT v_allowed_now OR v_allowed_now IS NULL THEN
        RETURN;
    END IF;

    -- 2. Calcular limite diário restante (base Sampa)
    SELECT COUNT(*)::int INTO v_sent_today
    FROM public.outbound_queue oq_sent
    WHERE oq_sent.campaign_id = p_campaign_id 
      AND oq_sent.status IN ('sent', 'delivered', 'read') 
      AND (oq_sent.sent_at AT TIME ZONE 'America/Sao_Paulo')::DATE = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;

    v_actual_limit := LEAST(p_limit, GREATEST(0, COALESCE(v_daily_limit, 999999) - v_sent_today));

    IF v_actual_limit <= 0 THEN
        RETURN;
    END IF;

    -- 3. Buscar e TRAVAR os leads (Com Reengajamento, Scheduled_at e Exclusão de Convertidos)
    RETURN QUERY
    WITH selected_leads AS (
        UPDATE public.outbound_queue q
        SET 
            status = 'processing',
            last_attempt_at = NOW(),
            reengagement_attempt_count = CASE 
                WHEN q.status != 'pending' THEN q.reengagement_attempt_count + 1 
                ELSE q.reengagement_attempt_count 
            END,
            reengagement_last_sent_at = CASE 
                WHEN q.status != 'pending' THEN NOW() 
                ELSE q.reengagement_last_sent_at 
            END
        WHERE q.id IN (
            SELECT oq.id 
            FROM public.outbound_queue oq
            JOIN public.campaigns camp ON camp.id = oq.campaign_id
            WHERE oq.tenant_id = p_tenant_id
              AND oq.campaign_id = p_campaign_id
              AND COALESCE(oq.scheduled_at, NOW()) <= NOW() -- Trava de agendamento tolerando nulos
              AND (
                  oq.status = 'pending'
                  OR 
                  (
                      camp.reengagement_enabled = true
                      AND oq.status IN ('sent', 'delivered', 'read')
                      AND oq.response_detected = false
                      AND oq.reengagement_attempt_count < camp.reengagement_max_attempts
                      AND NOW() >= (
                          COALESCE(oq.reengagement_last_sent_at, (oq.metadata->>'read_at')::timestamptz, oq.sent_at) 
                          + (camp.reengagement_wait_hours * INTERVAL '1 hour')
                      )
                      -- [TRAVA ANTI-ZUMBI] Respeita o prazo máximo de vida do lead na campanha
                      AND NOW() <= (
                          oq.sent_at 
                          + (COALESCE(camp.reengagement_max_attempts, 1) * COALESCE(camp.reengagement_wait_hours, 24) * INTERVAL '1 hour')
                          + INTERVAL '3 days'
                      )
                  )
              )
              -- [FREQUÊNCIA CAPPING HIERÁRQUICO]
              AND (
                  (v_capping->>'override_for_incidents')::boolean = true -- Emergência ignora capping
                  OR
                  (oq.status != 'pending') -- [FIX]: Reengajamento ignora a trava de cooldown do Capping Global para respeitar estritamente o tempo configurado na campanha
                  OR
                  (COALESCE((oq.metadata->>'is_funnel_followup')::boolean, false) = true) -- Follow-up de funil em andamento ignora capping global
                  OR
                  NOT EXISTS (
                      SELECT 1 FROM public.contact_pressure_logs cpl
                      WHERE cpl.tenant_id = p_tenant_id
                        AND cpl.contact_phone = oq.contact_phone
                        AND cpl.sent_at > NOW() - (COALESCE(v_capping->>'cooldown_hours', '24')::int || ' hours')::interval
                  )
              )
              -- [EXCLUSÃO DE LEADS JÁ CONVERTIDOS]
              AND NOT (
                  COALESCE((oq.metadata->>'is_funnel_followup')::boolean, false) = false
                  AND (
                      trim(lower(oq.status)) = 'converted' 
                      OR COALESCE(oq.metadata->>'converted', 'false') = 'true'
                      OR EXISTS (
                          SELECT 1 FROM public.messages m
                          WHERE m.conversation_id = oq.conversation_id
                            AND (m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%')
                            AND m.created_at >= COALESCE(oq.sent_at, oq.created_at)
                      )
                      OR (
                          'CLIENT_RESPONDED' = ANY(COALESCE(camp.success_criteria, '{}'::text[]))
                          AND EXISTS (
                              SELECT 1 FROM public.messages m
                              WHERE m.conversation_id = oq.conversation_id
                                AND m.sender_type = 'user'
                                AND m.direction = 'inbound'
                                AND m.created_at >= COALESCE(oq.sent_at, oq.created_at)
                          )
                      )
                      OR (
                          'LINK_SENT' = ANY(COALESCE(camp.success_criteria, '{}'::text[]))
                          AND COALESCE(camp.success_link_filter, '') <> ''
                          AND EXISTS (
                              SELECT 1 FROM public.messages m
                              WHERE m.conversation_id = oq.conversation_id
                                AND (
                                  (m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system') AND m.content ILIKE '%' || camp.success_link_filter || '%')
                                  OR m.content ILIKE '%✅ [CONVERSÃO]%'
                                  OR m.content ILIKE '%[CONVERSÃO]%'
                                )
                                AND m.created_at >= COALESCE(oq.sent_at, oq.created_at)
                          )
                      )
                  )
              )
              -- [ANTI-COLISÃO ORIGINAL ATUALIZADO]
              AND NOT EXISTS (
                  SELECT 1 FROM public.outbound_queue oq_check
                  WHERE oq_check.tenant_id = p_tenant_id
                    AND oq_check.contact_phone = oq.contact_phone
                    AND (oq_check.status = 'sent' OR oq_check.status = 'processing')
                    AND (oq_check.id <> oq.id)
                    AND (oq_check.sent_at > (NOW() - INTERVAL '2 hours') OR (oq_check.status = 'processing' AND oq_check.last_attempt_at > NOW() - INTERVAL '30 minutes'))
              )
            ORDER BY 
                (COALESCE((oq.metadata->>'is_funnel_followup')::boolean, false)) DESC,
                (oq.status = 'pending') DESC, 
                COALESCE(oq.scheduled_at, NOW()) ASC, 
                oq.created_at ASC
            LIMIT v_actual_limit
            FOR UPDATE SKIP LOCKED 
        )
        RETURNING q.*
    ),
    -- Registra a pressão de contato para os leads selecionados usando aliases para evitar ambiguidade
    log_pressure AS (
        INSERT INTO public.contact_pressure_logs (tenant_id, contact_phone, campaign_id)
        SELECT sl.tenant_id, sl.contact_phone, sl.campaign_id FROM selected_leads sl
    )
    SELECT 
        sl.id,
        sl.contact_phone::text as phone,
        sl.contact_name::text,
        sl.campaign_id,
        c.agent_id,
        sl.tenant_id,
        CASE 
            WHEN (sl.metadata->>'is_funnel_followup')::boolean = true THEN (sl.metadata->>'content')::text
            WHEN sl.reengagement_attempt_count > 0 THEN COALESCE(c.reengagement_message, c.initial_message)
            ELSE COALESCE(sl.metadata->>'content', c.initial_message)
        END::text as message,
        COALESCE(ag.whatsapp_provider, 'evolution')::text as provider,
        ag.evolution_instance::text as instance,
        ag.evolution_token::text as evolution_token,
        ag.meta_api_token::text as meta_api_token,
        ag.meta_phone_number_id::text as meta_phone_number_id,
        ag.zenvia_api_token::text as zenvia_api_token,
        ag.zenvia_channel_id::text as zenvia_channel_id,
        -- LÓGICA DE TEMPLATE: Se for follow-up de abandono, template_id é vazio (texto livre no WhatsApp)
        CASE 
            WHEN (sl.metadata->>'is_funnel_followup')::boolean = true THEN ''
            WHEN sl.reengagement_attempt_count > 0 THEN COALESCE(c.reengagement_template_id, (c.metadata->>'template_id')::text, '')
            ELSE COALESCE((c.metadata->>'template_id')::text, '')
        END::text as template_id,
        COALESCE(sl.metadata->>'cta_link', c.metadata->>'zenvia_cta_link', c.metadata->>'cta_link', '')::text as cta_link,
        COALESCE(c.metadata->>'zenvia_image_url', '')::text as zenvia_image_url,
        c.metadata as campaign_metadata,
        sl.metadata as lead_metadata
    FROM selected_leads sl
    JOIN public.campaigns c ON c.id = sl.campaign_id
    JOIN public.agents ag ON ag.id = c.agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO service_role;


DROP FUNCTION IF EXISTS public.enqueue_funnel_abandonment_followups();
DROP FUNCTION IF EXISTS public.enqueue_funnel_abandonment_followups(UUID, UUID);

CREATE OR REPLACE FUNCTION public.enqueue_funnel_abandonment_followups(
    p_agent_id UUID,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
              -- [REGRA DE CAMPANHA DO MESMO DIA]: Só considera campanhas disparadas hoje (ignora ontem ou mais antigas)
              AND (
                  c.start_date = (v_now_sp)::date
                  OR (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (v_now_sp)::date
              )
              -- [REGRA DE 24 HORAS]: Apenas dentro das 24 horas iniciais do disparo da campanha
              AND c.created_at >= (NOW() - INTERVAL '24 hours')
        LOOP
            -- [REGRA 3]: Respeitar estritamente o horário configurado na campanha
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
                  -- O cliente precisa ter respondido pelo menos uma vez (iniciou o funil)
                  AND EXISTS (
                      SELECT 1 FROM public.messages m_user
                      WHERE m_user.conversation_id = conv.id
                        AND m_user.sender_type = 'user'
                        AND m_user.direction = 'inbound'
                  )
                  -- [BLOQUEIO ESTRITO HISTÓRICO]: NUNCA reengajar leads que já receberam recusa, transbordo ou concluíram a análise
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
                  -- [REGRA DE 24 HORAS]: Apenas leads com atividade e disparo dentro das 24h iniciais
                  AND conv.last_message_at >= (NOW() - INTERVAL '24 hours')
                  AND oq.sent_at >= (NOW() - INTERVAL '24 hours')
                  -- Não enfileirar se a fila já estiver pendente ou em processamento para este lead
                  AND oq.status NOT IN ('pending', 'processing')
                ORDER BY conv.last_message_at ASC
                LIMIT 50
            LOOP
                -- Quantas tentativas de follow-up já foram feitas para esta conversa?
                v_current_attempts := COALESCE((v_target.conv_metadata->>'funnel_followup_attempt_count')::int, 0);

                -- [REGRA 2]: Limite de envios configurado no agente (máximo 3)
                IF v_current_attempts >= v_agent.max_attempts THEN
                    CONTINUE;
                END IF;

                -- Se já houve envio anterior, verificar se já se passou o tempo de espera desde o último envio
                IF v_current_attempts > 0 THEN
                    IF (v_target.conv_metadata->>'funnel_followup_last_sent_at') IS NOT NULL THEN
                        IF (v_target.conv_metadata->>'funnel_followup_last_sent_at')::timestamptz > (NOW() - v_delay_interval) THEN
                            CONTINUE; -- Ainda em cooldown da tentativa anterior
                        END IF;
                    END IF;
                END IF;

                -- Verificar a última mensagem do chat: deve ter sido enviada pela Sofia (agente)
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

                -- [FILTRO DE EXCLUSÃO DE LEADS JÁ RESOLVIDOS / EM ESTEIRA FISERV]:
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

                -- [REGRA 1 - OPÇÃO A]: Identificar a etapa exata em que o cliente parou
                v_step := 'geral';
                IF v_last_msg.content ILIKE '%faturamento%' OR v_last_msg.content ILIKE '%faturamento médio%' THEN
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

                -- Identificar empresa
                v_company_name := COALESCE(
                    v_target.oq_metadata->>'empresa', 
                    v_target.oq_metadata->>'company_name', 
                    v_target.oq_metadata->>'razao_social',
                    v_target.user_name,
                    'sua empresa'
                );

                -- Higienização do primeiro nome: remove CNPJ/dígitos iniciais (ex: '57.387.903 MARCOS' -> 'Marcos')
                v_first_name := split_part(trim(regexp_replace(COALESCE(v_target.user_name, v_target.contact_name, ''), '^[0-9\.\/\-\s]+', '')), ' ', 1);
                IF v_first_name IS NULL OR length(v_first_name) < 2 THEN
                    v_first_name := split_part(trim(regexp_replace(v_company_name, '^[0-9\.\/\-\s]+', '')), ' ', 1);
                END IF;
                IF v_first_name IS NULL OR length(v_first_name) < 2 THEN
                    v_first_name := 'parceiro';
                ELSE
                    v_first_name := initcap(lower(v_first_name));
                END IF;

                -- Gerar mensagem e configurar botões interativos
                IF v_step = 'coleta_faturamento' THEN
                    v_followup_message := 'Olá, ' || v_first_name || '! Vi que paramos na pergunta sobre o faturamento médio da ' || v_company_name || '. Ficou com alguma dúvida? Se preferir, pode me passar apenas uma estimativa aproximada (ex: 80 mil) para vermos as taxas liberadas!';
                    v_interactive_buttons := NULL; -- Aguarda digitação de valor monetário (sem botões)
                ELSIF v_step = 'coleta_valor' THEN
                    v_followup_message := 'Olá, ' || v_first_name || '! Falta pouco para liberar a análise da ' || v_company_name || '. Qual valor aproximado você gostaria de simular no momento? (Temos limites entre 20 e 500 mil reais).';
                    v_interactive_buttons := NULL; -- Aguarda digitação de valor monetário (sem botões)
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

                -- [REGRA 4]: Enfileirar na outbound_queue para ser despachado pelo fluxo normal
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

                -- Atualizar metadados da conversa para controle de tentativas e idempotência
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
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT public.enqueue_funnel_abandonment_followups(NULL::UUID, NULL::UUID);
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_funnel_abandonment_followups() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_funnel_abandonment_followups() TO service_role;

