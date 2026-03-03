-- ========================================================================================
-- SISTEMA DE SEGURANÇA TRANSACIONAL V6.0 (BLINDADO)
-- ========================================================================================

-- 1. GARANTE QUE A TABELA DE SESSÕES TEM O ÍNDICE CORRETO PARA O "ON CONFLICT"
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idx_conversation_agent_unique') THEN
        ALTER TABLE public.conversation_security_sessions 
        ADD CONSTRAINT idx_conversation_agent_unique UNIQUE (conversation_id, agent_id);
    END IF;
END $$;

-- 2. RPC: VALIDADOR DE IDENTIDADE (CHAMADO PELO GATEKEEPER NO N8N)
-- Agora recebe Agent ID e Conversation ID para atualizar a sessão CERTA.
CREATE OR REPLACE FUNCTION public.mock_validate_identity(p_agent_id uuid, p_conversation_id uuid, p_doc VARCHAR)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name VARCHAR;
    v_clean_doc VARCHAR;
BEGIN
    v_clean_doc := regexp_replace(p_doc, '\D', '', 'g');
    
    -- 1. BUSCA O CLIENTE NO NOSSO MOCK
    SELECT name INTO v_name FROM public.mock_customers 
    WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_doc;

    IF FOUND THEN
        -- 2. ABRE O CADEADO: Grava na sessão que este usuário está AUTENTICADO
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status, validated_identifier, expires_at, updated_at)
        VALUES (p_conversation_id, p_agent_id, 'active', v_clean_doc, now() + interval '20 minutes', now())
        ON CONFLICT (conversation_id, agent_id) DO UPDATE 
        SET status = 'active', 
            validated_identifier = v_clean_doc, 
            expires_at = now() + interval '20 minutes',
            updated_at = now();

        RETURN jsonb_build_object(
            'valid', true, 
            'message', 'Identidade confirmada! Bem-vindo(a) ' || v_name || '. Como posso te ajudar hoje?'
        );
    ELSE
        -- 3. BARRADO: CPF não é nosso cliente
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'CPF não localizado em nossa base. Por favor, verifique os números ou fale com um atendente.'
        );
    END IF;
END; $$;

-- 3. RPC: AVALIADOR DE SEGURANÇA (O GUARDA DO FLUXO)
-- Chamado em TODA mensagem para conferir se o cadeado está aberto ou fechado.
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id uuid, p_conversation_id uuid, p_intent text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session RECORD;
    v_is_logout BOOLEAN;
BEGIN
    -- Identifica intenções de reset
    v_is_logout := p_intent IN ('logout', 'switch_user', 'reset_session');

    -- Se for LOGOUT, reseta tudo IMEDIATAMENTE
    IF v_is_logout THEN
        UPDATE public.conversation_security_sessions 
        SET status = 'expired', 
            validated_identifier = NULL, 
            updated_at = now() 
        WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id;
        
        RETURN jsonb_build_object(
            'allowToolExecution', false, 
            'requiresValidation', true, 
            'session_status', 'unauthenticated'
        );
    END IF;

    -- Busca a sessão atual para este papo e este agente
    SELECT * INTO v_session 
    FROM public.conversation_security_sessions 
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id 
    ORDER BY updated_at DESC LIMIT 1;

    -- DECISÃO DE FLUXO:
    -- Se a sessão existe, é ATIVA e tem o CPF salvo...
    IF v_session.id IS NOT NULL AND v_session.status = 'active' AND v_session.validated_identifier IS NOT NULL THEN
        -- CADEADO ABERTO! IA pode trabalhar.
        RETURN jsonb_build_object(
            'allowToolExecution', true, 
            'requiresValidation', false, 
            'session_status', 'active', 
            'validated_identifier', v_session.validated_identifier
        );
    ELSE
        -- CADEADO FECHADO! Manda pro Gatekeeper colher o CPF.
        RETURN jsonb_build_object(
            'allowToolExecution', false, 
            'requiresValidation', true, 
            'session_status', 'unauthenticated'
        );
    END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.mock_validate_identity(uuid, uuid, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_conversation_security(uuid, uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
