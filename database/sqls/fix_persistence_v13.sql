-- ========================================================================================
-- SISTEMA DE SEGURANÇA TRANSACIONAL V13 (N8N ROUTING SYNC & CRASH PROTECTION)
-- ========================================================================================

-- 1. LIMPA FUNCOES PARA EVITAR CONFLITOS DE ASSINATURA
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(text, text, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(text, text, text, text);
DROP FUNCTION IF EXISTS public.financial_get_customer_summary_safe(uuid, uuid);
DROP FUNCTION IF EXISTS public.financial_get_customer_summary_safe(uuid, uuid, text);

-- 2. AVALIADOR DE SEGURANCA: O Portão Absoluto
-- Se não tem sessão, SEMPRE retorna false. Isso garante que a mensagem vá para o "AI Agent (Sem Ferramentas)" que possui a Tool de Validação.
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id uuid, p_conversation_id uuid, p_intent text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session RECORD;
    v_is_enabled BOOLEAN;
    v_clean_intent TEXT;
    v_timeout INT;
BEGIN
    v_clean_intent := COALESCE(TRIM(LOWER(p_intent)), 'general');
    
    -- Verifica as configurações do Agente
    SELECT (brain_config->'capabilities'->'identity_gate'->>'enabled')::boolean, session_timeout_seconds 
    INTO v_is_enabled, v_timeout 
    FROM public.agents WHERE id = p_agent_id;
    
    IF NOT COALESCE(v_is_enabled, false) THEN
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false);
    END IF;

    -- Reset de sessão forçado
    IF v_clean_intent IN ('trocar_cpf', 'switch_user', 'logout', 'reset') THEN
        UPDATE public.conversation_security_sessions SET status = 'expired', updated_at = now() WHERE conversation_id = p_conversation_id;
        RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'expired');
    END IF;

    -- Busca sessão ativa
    SELECT * INTO v_session FROM public.conversation_security_sessions 
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id LIMIT 1;

    -- Verifica validade da Sessão
    IF v_session.status = 'active' AND v_session.expires_at > now() THEN
        -- Renova Timeout (Rolling Session)
        UPDATE public.conversation_security_sessions 
        SET expires_at = now() + (COALESCE(v_timeout, 1200) || ' seconds')::interval, updated_at = now()
        WHERE id = v_session.id;

        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', 'active', 'validated_identifier', v_session.validated_identifier);
    END IF;

    -- 🔴 CRASH FIX: SE ESTÁ DESLOGADO, SEMPRE BLOQUEIA! 
    -- Se retornarmos "true" aqui (como nas versões anteriores), a mensagem vai para o AI Principal que NÃO TEM a ferramenta Validar_Documento, causando falhas. 
    -- Retornando "false", a mensagem do CPF vai certinho para o AI Gatekeeper que executa a Tool de validação!
    RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'unauthenticated');
END; $$;

-- 3. VALIDADOR DE IDENTIDADE À PROVA DE BALAS (Com tratamento de erro p/ o N8N não falhar 500)
CREATE OR REPLACE FUNCTION public.mock_validate_identity(
    p_agent_id text DEFAULT NULL, 
    p_conversation_id text DEFAULT NULL, 
    p_doc text DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name VARCHAR;
    v_clean_doc VARCHAR;
    v_conv_uuid uuid;
    v_agent_uuid uuid;
    v_timeout INTEGER;
BEGIN
    -- Cast seguro do ID da conversa
    BEGIN
        v_conv_uuid := p_conversation_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('valid', false, 'message', 'ID de conversa inválido ou não informado.');
    END;

    -- Limpa CPF/CNPJ
    v_clean_doc := regexp_replace(COALESCE(p_doc, ''), '\D', '', 'g');
    IF v_clean_doc = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Documento não fornecido.');
    END IF;

    -- Tenta pegar o agente pela conversa para blindar contra falhas do n8n enviar a variável vazia
    SELECT agent_id INTO v_agent_uuid FROM public.conversations WHERE id = v_conv_uuid LIMIT 1;
    
    IF v_agent_uuid IS NULL AND p_agent_id IS NOT NULL AND p_agent_id <> '' THEN
        BEGIN
            v_agent_uuid := p_agent_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_agent_uuid := NULL;
        END;
    END IF;

    IF v_agent_uuid IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Agente não localizado para vincular a sessão.');
    END IF;

    -- Busca cliente
    SELECT name INTO v_name FROM public.mock_customers WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_doc;

    IF FOUND THEN
        SELECT COALESCE(session_timeout_seconds, 1200) INTO v_timeout FROM public.agents WHERE id = v_agent_uuid;
        
        -- Atualiza/Cria sessão segura com o CPF novo
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status, validated_identifier, expires_at, updated_at)
        VALUES (v_conv_uuid, v_agent_uuid, 'active', v_clean_doc, now() + (COALESCE(v_timeout,1200) || ' seconds')::interval, now())
        ON CONFLICT (conversation_id, agent_id) DO UPDATE SET 
            status = 'active', 
            validated_identifier = v_clean_doc, 
            expires_at = EXCLUDED.expires_at, 
            updated_at = EXCLUDED.updated_at;

        RETURN jsonb_build_object(
            'valid', true, 
            'message', 'Identidade confirmada com sucesso! Bem-vindo(a) ' || v_name || '. Como posso te ajudar?',
            'active_cpf', v_clean_doc
        );
    ELSE
        RETURN jsonb_build_object('valid', false, 'message', 'Documento não reconhecido. Por favor, verifique o número.');
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Em vez do Postgre dar crash e estourar a requisição do N8N na ferramenta, retorna uma msg amigável pr a IA
    RETURN jsonb_build_object('valid', false, 'message', 'Erro sistêmico ao validar identidade: ' || SQLERRM);
END; $$;

-- 4. FERRAMENTA DE CONSULTA SEGURA 
CREATE OR REPLACE FUNCTION public.financial_get_customer_summary_safe(p_agent_id uuid, p_conversation_id uuid)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sec JSONB;
BEGIN
    v_sec := public.evaluate_conversation_security(p_agent_id, p_conversation_id, 'boletos');
    
    IF (v_sec->>'allowToolExecution')::boolean = FALSE THEN
        RETURN jsonb_build_object('error', 'UNAUTHENTICATED', 'message', 'A sessão expirou ou o CPF não foi validado. Solicite a validação de segurança.');
    END IF;

    -- Busca puxando o CPF validado do banco com 100% de confiança
    RETURN public.mock_get_customer_summary(v_sec->>'validated_identifier');
END; $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
