-- ========================================================================================
-- SISTEMA DE SEGURANÇA TRANSACIONAL V12.0 (FIX PERSISTÊNCIA & ISOLAMENTO)
-- ========================================================================================

-- 1. GARANTE LIMPEZA DE VERSÕES CONFLITANTES PARA EVITAR AMBIGUIDADE DE SCHEMA
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(text, text, text);
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(text, text, text, text);

-- 2. RPC: AVALIADOR DE SEGURANÇA (O GUARDA DO FLUXO)
-- Retorna o documento autenticado da sessão atual. Essencial para ferramentas session-aware.
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id uuid, p_conversation_id uuid, p_intent text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session RECORD;
    v_is_reset BOOLEAN;
BEGIN
    -- Identifica intenções de troca (trocar cpf, mudar usuario, etc)
    v_is_reset := p_intent IN ('logout', 'switch_user', 'reset_session', 'trocar_cpf', 'mudar_usuario');

    -- Se for RESET, invalida a sessão antiga IMEDIATAMENTE para limpeza de estado
    IF v_is_reset THEN
        UPDATE public.conversation_security_sessions 
        SET status = 'expired', 
            validated_identifier = NULL, 
            updated_at = now() 
        WHERE conversation_id = p_conversation_id;
        
        RETURN jsonb_build_object(
            'allowToolExecution', false, 
            'requiresValidation', true, 
            'session_status', 'unauthenticated'
        );
    END IF;

    -- Busca a sessão mais recente para esta conversa
    SELECT * INTO v_session FROM public.conversation_security_sessions 
    WHERE conversation_id = p_conversation_id 
    ORDER BY updated_at DESC LIMIT 1;

    -- Proteção contra timeout (ex: se o usuário ficou 20min sem falar)
    IF v_session.id IS NOT NULL AND v_session.expires_at < now() AND v_session.status = 'active' THEN
        UPDATE public.conversation_security_sessions SET status = 'expired' WHERE id = v_session.id;
        v_session.status := 'expired';
    END IF;

    -- Resposta Positiva: Cadeado Aberto
    IF v_session.id IS NOT NULL AND v_session.status = 'active' AND v_session.validated_identifier IS NOT NULL THEN
        RETURN jsonb_build_object(
            'allowToolExecution', true, 
            'requiresValidation', false, 
            'session_status', 'active', 
            'validated_identifier', v_session.validated_identifier
        );
    ELSE
        -- Resposta Negativa: Bloqueio (Manda validar documento)
        RETURN jsonb_build_object(
            'allowToolExecution', false, 
            'requiresValidation', true, 
            'session_status', 'unauthenticated'
        );
    END IF;
END; $$;

-- 3. RPC: VALIDADOR DE IDENTIDADE (TEXTO PARA COMPATIBILIDADE N8N)
-- Agora retorna o 'validated_identifier' de volta para a IA confirmar visualmente
CREATE OR REPLACE FUNCTION public.mock_validate_identity(
    p_agent_id text, 
    p_conversation_id text, 
    p_doc text DEFAULT NULL, 
    p_identifier text DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name VARCHAR;
    v_clean_doc VARCHAR;
    v_raw_doc VARCHAR;
    v_conv_id uuid;
    v_res JSONB;
BEGIN
    v_conv_id := p_conversation_id::uuid;
    v_raw_doc := COALESCE(p_doc, p_identifier);
    v_clean_doc := regexp_replace(v_raw_doc, '\D', '', 'g');
    
    -- Busca na base mock
    SELECT name INTO v_name FROM public.mock_customers 
    WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_doc;

    IF FOUND THEN
        -- RESET E CRIAÇÃO SÍNCRONA DE SESSÃO
        DELETE FROM public.conversation_security_sessions WHERE conversation_id = v_conv_id;
        
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status, validated_identifier, expires_at, updated_at)
        VALUES (v_conv_id, p_agent_id::uuid, 'active', v_clean_doc, now() + interval '24 hours', now());

        v_res := jsonb_build_object(
            'valid', true, 
            'message', 'Identidade confirmada! Bem-vindo(a) ' || v_name || '. Como posso te ajudar?',
            'active_cpf', v_clean_doc -- Retorna explicitamente o CPF ativo
        );
    ELSE
        v_res := jsonb_build_object('valid', false, 'message', 'Cadastro não localizado em nossa base legacy.');
    END IF;

    RETURN v_res;
END; $$;

-- 4. FERRAMENTA FINANCEIRA SEGURA (O PULO DO GATO)
-- Esta ferramenta NÃO recebe CPF da IA. Ela descobre o CPF da sessão.
-- Isso previne que a IA use o CPF do João quando o usuário agora é a Maria.
CREATE OR REPLACE FUNCTION public.financial_get_customer_summary_safe(p_agent_id uuid, p_conversation_id uuid)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sec JSONB;
    v_cpf VARCHAR;
BEGIN
    -- 1. Verifica no "Guarda" quem é o dono da conversa AGORA
    v_sec := public.evaluate_conversation_security(p_agent_id, p_conversation_id, 'check');
    
    IF (v_sec->>'allowToolExecution')::boolean = FALSE THEN
        RETURN jsonb_build_object('error', 'UNAUTHENTICATED', 'message', 'Sessão insegura ou expirada. Revalide o CPF.');
    END IF;
    
    v_cpf := v_sec->>'validated_identifier';

    -- 2. Busca os dados reais para ESTE CPF da sessão
    RETURN public.mock_get_customer_summary(v_cpf);
END; $$;

-- 5. PERMISSÕES
GRANT EXECUTE ON FUNCTION public.evaluate_conversation_security(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mock_validate_identity(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.financial_get_customer_summary_safe(uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
