-- 1. DESTRUIDOR DE CLONES: Localiza e apaga QUALQUER variação do Gatekeeper para limpar a ambiguidade "is not unique"
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT oid::regprocedure AS function_sig
        FROM pg_proc
        WHERE proname = 'evaluate_conversation_security'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.function_sig || ' CASCADE';
    END LOOP;
END
$$;

-- 2. RECRIAR O GATEKEEPER DE SEGURANÇA (O ÚNICO E VERDADEIRO)
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id uuid, p_conversation_id uuid, p_intent text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session RECORD;
    v_is_enabled BOOLEAN;
    v_clean_intent TEXT;
    v_timeout INT;
BEGIN
    v_clean_intent := COALESCE(TRIM(LOWER(p_intent)), 'general');
    
    SELECT (brain_config->'capabilities'->'identity_gate'->>'enabled')::boolean, session_timeout_seconds 
    INTO v_is_enabled, v_timeout 
    FROM public.agents WHERE id = p_agent_id;
    
    -- Se estiver desativado nas configs, deixa tudo passar
    IF NOT COALESCE(v_is_enabled, false) THEN
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false);
    END IF;

    -- Intenções de logout forçam fechamento
    IF v_clean_intent IN ('trocar_cpf', 'switch_user', 'logout', 'reset') THEN
        UPDATE public.conversation_security_sessions 
        SET status = 'expired', updated_at = now() 
        WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id;
        
        RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'expired');
    END IF;

    -- Traz a sessão oficial (agora confiável pela trava UNIQUE)
    SELECT * INTO v_session FROM public.conversation_security_sessions 
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id 
    LIMIT 1;

    -- Avalia se está autenticado dentro da janela de validade (ex 15 min)
    IF v_session.id IS NOT NULL AND v_session.status = 'active' THEN
        IF v_session.expires_at > now() THEN
            -- Renova a janela e aprova acesso
            UPDATE public.conversation_security_sessions 
            SET expires_at = now() + (COALESCE(v_timeout, 1200) || ' seconds')::interval, updated_at = now()
            WHERE id = v_session.id;

            RETURN jsonb_build_object(
                'allowToolExecution', true, 
                'requiresValidation', false, 
                'session_status', 'active', 
                'session_identifier', v_session.validated_identifier
            );
        ELSE
            -- Expirou o tempo, manda bloquear na hora
            UPDATE public.conversation_security_sessions 
            SET status = 'expired', updated_at = now()
            WHERE id = v_session.id;
        END IF;
    END IF;

    -- Sem acesso, trava a Tool e solicita CPF
    RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'unauthenticated');
END; $$;

-- 3. Atualizar a função financeira para usar p_doc
DROP FUNCTION IF EXISTS public.financial_get_customer_summary_safe(text, text, text);
DROP FUNCTION IF EXISTS public.financial_get_customer_summary_safe(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.financial_get_customer_summary_safe(
    p_agent_id text DEFAULT NULL, 
    p_conversation_id text DEFAULT NULL,
    p_doc text DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sec JSONB;
    v_conv_uuid uuid;
    v_agent_uuid uuid;
    v_safe_doc text;
BEGIN
    BEGIN
        v_conv_uuid := p_conversation_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('error', 'INVALID_ID', 'message', 'ID de conversa não reconhecido pelo servidor.');
    END;

    BEGIN
        v_agent_uuid := p_agent_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_agent_uuid := NULL; 
    END;

    -- Chama a validação de segurança do Gatekeeper
    v_sec := public.evaluate_conversation_security(v_agent_uuid, v_conv_uuid, 'protected'::text);
    
    IF (v_sec->>'allowToolExecution')::boolean = FALSE THEN
        RETURN jsonb_build_object(
            'error', 'UNAUTHENTICATED', 
            'message', 'A sessão de segurança expirou. Solicite que o usuário forneça o documento novamente.'
        );
    END IF;

    -- Segurança e Isolamento: usa o identificador validado pelo sentinela
    v_safe_doc := v_sec->>'session_identifier';

    RETURN public.mock_get_customer_summary(v_safe_doc);
END; $$;

NOTIFY pgrst, 'reload schema';
