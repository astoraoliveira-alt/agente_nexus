-- 1. CRIA TABELA DE LOGS PARA DIAGNÓSTICO PROFUNDO
CREATE TABLE IF NOT EXISTS public.security_logs (
    id SERIAL PRIMARY KEY,
    event_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
    function_name TEXT,
    conversation_id UUID,
    provided_id TEXT,
    intent TEXT,
    result JSONB
);

-- 2. LIMPA TUDO
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(text, text, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(text, text, text, text);

-- 3. VALIDADOR DE IDENTIDADE (TEXTO)
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
    
    SELECT name INTO v_name FROM public.mock_customers 
    WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_doc;

    IF FOUND THEN
        -- LIMPA E CRIA SESSÃO
        DELETE FROM public.conversation_security_sessions WHERE conversation_id = v_conv_id;
        
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status, validated_identifier, expires_at, updated_at)
        VALUES (v_conv_id, p_agent_id::uuid, 'active', v_clean_doc, now() + interval '24 hours', now());

        v_res := jsonb_build_object('valid', true, 'message', 'Identidade confirmada! Bem-vindo(a) ' || v_name);
    ELSE
        v_res := jsonb_build_object('valid', false, 'message', 'Cadastro não localizado.');
    END IF;

    -- LOGA O EVENTO
    INSERT INTO public.security_logs (function_name, conversation_id, provided_id, result)
    VALUES ('validate', v_conv_id, p_conversation_id, v_res);

    RETURN v_res;
END; $$;

-- 4. AVALIADOR DE SEGURANÇA (TEXTO) - VERSÃO ULTRA PERMISSIVA PARA TESTE
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id text, p_conversation_id text, p_intent text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session RECORD;
    v_conv_id uuid;
    v_res JSONB;
BEGIN
    v_conv_id := p_conversation_id::uuid;

    -- BUSCA QUALQUER SESSÃO PARA ESSA CONVERSA (MESMO QUE NÃO SEJA "active")
    SELECT * INTO v_session FROM public.conversation_security_sessions 
    WHERE conversation_id = v_conv_id
    ORDER BY updated_at DESC LIMIT 1;

    -- LOGA O QUE ENCONTROU NO BANCO ANTES DE DECIDIR
    v_res := jsonb_build_object(
        'found_session_id', v_session.id,
        'found_status', v_session.status,
        'found_identifier', v_session.validated_identifier
    );

    IF v_session.status = 'active' THEN
        v_res := v_res || jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', 'active');
    ELSE
        v_res := v_res || jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'unauthenticated');
    END IF;

    -- LOGA O EVENTO
    INSERT INTO public.security_logs (function_name, conversation_id, provided_id, intent, result)
    VALUES ('evaluate', v_conv_id, p_conversation_id, p_intent, v_res);

    RETURN v_res;
END; $$;

GRANT EXECUTE ON FUNCTION public.mock_validate_identity(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_conversation_security(text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
