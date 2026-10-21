-- MIGRATION: 20261019_fix_abandonment_and_anti_loop_rules.sql
-- Objetivo:
-- 1. get_funnel_abandonment_candidates: Blindar exclusão de leads que recusaram ("não quero", "não tenho interesse", "não insista"),
--    conversas encerradas ('closed', 'refused') e mensagens de despedida ("se precisar de algo no futuro", "fico por aqui à disposição").
-- 2. get_sales_cockpit_leads: Permitir que leads com limites pré-aprovados pela Fiserv e ofertas já enviadas no WhatsApp apareçam na esteira do Cockpit.

-- 1. ATUALIZAÇÃO DA RPC get_funnel_abandonment_candidates
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
                  AND conv.status::text NOT IN ('closed', 'refused', 'cancelled', 'human_active')
                  AND (conv.metadata->>'refused') IS DISTINCT FROM 'true'
                  AND (conv.metadata->>'optout') IS DISTINCT FROM 'true'
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
                            -- 🛡️ BLINDAGEM DE DESPEDIDAS E RECUSAS EXPLÍCITAS:
                            OR m_hist.content ILIKE '%se precisar de algo no futuro%'
                            OR m_hist.content ILIKE '%não quero%'
                            OR m_hist.content ILIKE '%nao quero%'
                            OR m_hist.content ILIKE '%não tenho interesse%'
                            OR m_hist.content ILIKE '%nao tenho interesse%'
                            OR m_hist.content ILIKE '%não insista%'
                            OR m_hist.content ILIKE '%nao insista%'
                            OR m_hist.content ILIKE '%tirar meu número%'
                            OR m_hist.content ILIKE '%tirar meu numero%'
                            OR m_hist.content ILIKE '%estarei por aqui à disposição%'
                            OR m_hist.content ILIKE '%estarei por aqui a disposicao%'
                            OR m_hist.content ILIKE '%fico por aqui à disposição%'
                            OR m_hist.content ILIKE '%fico por aqui a disposicao%'
                            OR m_hist.content ILIKE '%tenha um ótimo dia%'
                            OR m_hist.content ILIKE '%tenha um bom dia%'
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
                    'campaign_name', v_campaign.campaign_name,
                    'last_lead_message', v_last_msg.content,
                    'last_lead_message_at', v_target.last_message_at,
                    'attempts', v_current_attempts,
                    'history', COALESCE(v_msgs_json, '[]'::jsonb),
                    'metadata', v_target.oq_metadata
                );
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'candidates_count', jsonb_array_length(v_candidates),
        'candidates', v_candidates
    );
END;
$$;


-- 2. ATUALIZAÇÃO DA RPC get_sales_cockpit_leads
CREATE OR REPLACE FUNCTION public.get_sales_cockpit_leads(
    p_tenant_id uuid, 
    p_agent_id uuid DEFAULT NULL::uuid, 
    p_campaign_id uuid DEFAULT NULL::uuid, 
    p_user_id uuid DEFAULT NULL::uuid, 
    p_user_role text DEFAULT 'operator'::text, 
    p_stage_filter text DEFAULT 'all'::text
)
RETURNS TABLE(
    lead_id uuid, 
    conversation_id uuid, 
    name text, 
    cnpj text, 
    phone text, 
    campaign_id uuid, 
    campaign_name text, 
    campaign_status text, 
    requested_amount numeric, 
    requested_installments text, 
    monthly_payment numeric, 
    interest_rate numeric, 
    total_contract_amount numeric, 
    loan_request_id text, 
    pipeline_stage text, 
    assigned_operator_id uuid, 
    assigned_operator text, 
    conversation_status text, 
    total_messages bigint, 
    last_message_content text, 
    last_message_time timestamp with time zone, 
    messages jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH qualified_leads AS (
    SELECT DISTINCT ON (clean_phone)
      al.id AS q_lead_id,
      al.tenant_id AS q_tenant_id,
      al.campaign_id AS q_campaign_id,
      al.name AS q_name,
      al.whatsapp AS q_whatsapp,
      al.identifier AS q_cnpj,
      al.metadata AS q_metadata,
      al.created_at AS q_created_at,
      camp.id AS q_camp_id,
      camp.name::text AS q_campaign_name,
      camp.status::text AS q_campaign_status,
      regexp_replace(al.whatsapp, '\D', '', 'g') AS clean_phone
    FROM agent_leads al
    JOIN campaigns camp ON camp.id = al.campaign_id
    WHERE al.tenant_id = p_tenant_id
      -- 🎯 CRITÉRIO OFICIAL "OK AGENTE" DO DASHBOARD + OFERTAS ATIVAS EMITIDAS PELA FISERV:
      AND (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR al.metadata->'accepted_proposal' IS NOT NULL
          OR (
              al.metadata->>'fiserv_status' IN ('approved', 'comite_approved')
              AND al.metadata->>'fiserv_amount_approved' IS NOT NULL 
              AND al.metadata->>'fiserv_amount_approved' != ''
              AND (al.metadata->>'fiserv_offer_sent')::text = 'true'
          )
      )
      -- Validações de integridade da campanha
      AND camp.tenant_id = p_tenant_id
      AND camp.status IN ('active', 'completed')
      AND (p_agent_id IS NULL OR camp.agent_id = p_agent_id)
      AND (p_campaign_id IS NULL OR camp.id = p_campaign_id)
    ORDER BY clean_phone, al.created_at DESC
  )
  SELECT 
    ql.q_lead_id AS lead_id,
    conv.id AS conversation_id,
    COALESCE(ql.q_name, conv.user_name, 'Cliente')::text AS name,
    ql.q_cnpj::text AS cnpj,
    ql.q_whatsapp::text AS phone,
    ql.q_camp_id AS campaign_id,
    ql.q_campaign_name AS campaign_name,
    ql.q_campaign_status AS campaign_status,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'amount')::numeric,
        (ql.q_metadata->'simulation_data'->>'amount')::numeric,
        NULLIF(ql.q_metadata->>'fiserv_amount_approved', '')::numeric,
        (ql.q_metadata->>'requested_amount')::numeric,
        0
    ) AS requested_amount,
    COALESCE(
        ql.q_metadata->'accepted_proposal'->>'installments',
        ql.q_metadata->'simulation_data'->>'installments',
        ql.q_metadata->>'max_installments',
        ql.q_metadata->>'requested_installments',
        '24'
    )::text AS requested_installments,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'installment_value')::numeric,
        (ql.q_metadata->'simulation_data'->>'installment_value')::numeric,
        0
    ) AS monthly_payment,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'monthly_interest')::numeric,
        (ql.q_metadata->'simulation_data'->>'monthly_interest')::numeric,
        2.52
    ) AS interest_rate,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'total_debt')::numeric,
        (ql.q_metadata->'simulation_data'->>'total_debt')::numeric,
        0
    ) AS total_contract_amount,
    (ql.q_metadata->>'loan_request_id')::text AS loan_request_id,
    COALESCE(
        conv.metadata->>'pipeline_stage',
        ql.q_metadata->>'pipeline_stage',
        CASE 
            WHEN conv.assigned_operator_id IS NOT NULL OR conv.status = 'human_active' THEN 'in_contact' 
            ELSE 'pending_contact' 
        END
    )::text AS pipeline_stage,
    COALESCE(conv.assigned_operator_id, (ql.q_metadata->>'operator_id')::uuid) AS assigned_operator_id,
    COALESCE(
        u.full_name, 
        conv.metadata->>'operator_name', 
        ql.q_metadata->>'operator_name',
        ql.q_metadata->>'assigned_operator'
    )::text AS assigned_operator,
    conv.status::text AS conversation_status,
    COALESCE(conv.total_messages, 0)::bigint AS total_messages,
    conv.last_message_content::text AS last_message_content,
    COALESCE(conv.last_message_at, ql.q_created_at) AS last_message_time,
    COALESCE(conv.messages_agg, '[]'::jsonb) AS messages
  FROM qualified_leads ql
  LEFT JOIN LATERAL (
    SELECT 
      c.id,
      c.status,
      c.assigned_operator_id,
      c.metadata,
      c.last_message_at,
      c.created_at,
      c.user_identifier,
      c.user_name,
      (
        SELECT m.content 
        FROM messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.created_at DESC 
        LIMIT 1
      ) AS last_message_content,
      (
        SELECT count(*) 
        FROM messages m 
        WHERE m.conversation_id = c.id
      ) AS total_messages,
      (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', m_sub.id,
              'conversation_id', m_sub.conversation_id,
              'tenant_id', m_sub.tenant_id,
              'content', m_sub.content,
              'direction', m_sub.direction,
              'sender_type', m_sub.sender_type,
              'sender_name', m_sub.sender_name,
              'message_type', m_sub.message_type,
              'status', m_sub.status,
              'audio_url', m_sub.audio_url,
              'created_at', m_sub.created_at
            ) ORDER BY m_sub.created_at ASC
          ),
          '[]'::jsonb
        )
        FROM (
          SELECT *
          FROM messages m_inner
          WHERE m_inner.conversation_id = c.id
          ORDER BY m_inner.created_at ASC
          LIMIT 100
        ) m_sub
      ) AS messages_agg
    FROM conversations c
    WHERE c.tenant_id = ql.q_tenant_id
      AND c.user_identifier IN (
          ql.q_whatsapp,
          ql.clean_phone,
          '55' || ql.clean_phone,
          RIGHT(ql.clean_phone, 11),
          '55' || RIGHT(ql.clean_phone, 11)
      )
    ORDER BY 
      CASE WHEN c.campaign_id = ql.q_camp_id THEN 1 ELSE 2 END,
      CASE WHEN c.status = 'human_active' THEN 1 WHEN c.status = 'ai_active' THEN 2 ELSE 3 END,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) DESC,
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC
    LIMIT 1
  ) conv ON true
  LEFT JOIN users u ON u.id = COALESCE(conv.assigned_operator_id, (ql.q_metadata->>'operator_id')::uuid)
  WHERE 
    -- RBAC: Administradores e Super Admins veem tudo; operadores veem livres ou atribuídos a eles
    (
        p_user_role IN ('super_admin', 'admin', 'tenant_admin', 'administrador')
        OR (
            (conv.assigned_operator_id IS NULL AND COALESCE(conv.metadata->>'pipeline_stage', ql.q_metadata->>'pipeline_stage', 'pending_contact') = 'pending_contact')
            OR conv.assigned_operator_id = p_user_id
            OR (ql.q_metadata->>'operator_id')::uuid = p_user_id
        )
    )
    -- Filtro de etapa do funil
    AND (
        p_stage_filter = 'all'
        OR COALESCE(
            conv.metadata->>'pipeline_stage',
            ql.q_metadata->>'pipeline_stage',
            CASE WHEN conv.assigned_operator_id IS NOT NULL OR conv.status = 'human_active' THEN 'in_contact' ELSE 'pending_contact' END
        ) = p_stage_filter
    )
  ORDER BY last_message_time DESC;
END;
$function$;
