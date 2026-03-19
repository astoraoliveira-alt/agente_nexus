-- ============================================================================
-- NEXUS HUB: TRANSACTIONAL GATEKEEPER RPC
-- Objetivo: Roteamento seguro de execução de ferramentas baseado em contexto.
-- ============================================================================

-- Remover versões antigas para evitar Overload e erro 300 no PostgREST
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.mock_validate_identity(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.mock_validate_identity(UUID, TEXT, TEXT);

-- 1. Tabela de Sessões de Segurança (Isola o RAG e o Agente da Lógica de Autenticação)
-- Agora refazendo a tabela para forçar conversation_id como UUID (Resolve o erro 42883)
DROP TABLE IF EXISTS public.conversation_security_sessions;
CREATE TABLE public.conversation_security_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,        -- ID da conversa agora eh UUID obrigatoriamente
    agent_id UUID NOT NULL,               -- Agente dono da sessão
    status VARCHAR(50) NOT NULL DEFAULT 'unauthenticated', -- 'unauthenticated', 'active', 'locked', 'expired'
    validated_identifier TEXT,            -- O CPF/CNPJ que foi validado
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices essenciais
CREATE INDEX IF NOT EXISTS idx_security_sessions_conv ON public.conversation_security_sessions (conversation_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_security_sessions_status ON public.conversation_security_sessions (status);

-- ============================================================================

-- 2. A Função que o "Validador de Saudacao" / Roteador Inicial chama
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(
    p_agent_id UUID,
    p_conversation_id UUID,
    p_intent TEXT          -- 'general', 'protected', 'logout', etc.
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_record RECORD;
    v_allow_execution BOOLEAN := false;
    v_status TEXT := 'unauthenticated';
    v_identifier TEXT := NULL;
BEGIN

    -- 1. Se a intenção for expressamente "logout", destruímos/expiramos a sessão na hora
    IF p_intent = 'logout' THEN
        UPDATE public.conversation_security_sessions
        SET status = 'expired', 
            expires_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = p_conversation_id 
          AND agent_id = p_agent_id
          AND status = 'active';

        RETURN jsonb_build_object(
            'allowToolExecution', false,
            'session_status', 'expired',
            'message', 'Sessão encerrada com sucesso.'
        );
    END IF;


    -- 2. Buscar a sessão atual (a mais recente não expirada/bloqueada)
    SELECT * INTO v_session_record 
    FROM public.conversation_security_sessions
    WHERE conversation_id = p_conversation_id 
      AND agent_id = p_agent_id
    ORDER BY created_at DESC 
    LIMIT 1;

    -- 2.1 Atualiza status se expirou por tempo (ex: 20 minutos inativo)
    IF v_session_record.id IS NOT NULL THEN
        IF v_session_record.expires_at < NOW() AND v_session_record.status = 'active' THEN
            UPDATE public.conversation_security_sessions
            SET status = 'expired', updated_at = NOW()
            WHERE id = v_session_record.id;
            
            v_session_record.status := 'expired';
        END IF;

        IF v_session_record.locked_until < NOW() AND v_session_record.status = 'locked' THEN
            UPDATE public.conversation_security_sessions
            SET status = 'unauthenticated', updated_at = NOW()
            WHERE id = v_session_record.id;
            
            v_session_record.status := 'unauthenticated';
        END IF;
    END IF;

    -- 3. Avaliação da Regra (O Gatekeeper de fato)
    -- Intenções livres:
    IF p_intent IN ('general', 'saudacao', 'out_of_scope') THEN
        v_allow_execution := true;
        v_status := COALESCE(v_session_record.status, 'unauthenticated');
        v_identifier := v_session_record.validated_identifier;
    
    -- Intenções sensíveis / financeiras:
    ELSIF p_intent = 'protected' THEN
        IF v_session_record.status = 'active' THEN
            v_allow_execution := true;
            v_status := 'active';
            v_identifier := v_session_record.validated_identifier;
            
            -- Renova a sessão por mais 15 minutos de inatividade
            UPDATE public.conversation_security_sessions
            SET expires_at = NOW() + INTERVAL '15 minutes', updated_at = NOW()
            WHERE id = v_session_record.id;
        ELSE
            v_allow_execution := false;
            v_status := COALESCE(v_session_record.status, 'unauthenticated');
        END IF;
    
    -- Ataque ou erro de classificação
    ELSE
         v_allow_execution := false;
         v_status := 'blocked';
    END IF;

    -- Retorno limpo para o N8N Injetar/Mascarar as Tools
    RETURN jsonb_build_object(
        'allowToolExecution', v_allow_execution,
        'session_status', v_status,
        'session_identifier', v_identifier,
        'intent_evaluated', p_intent
    );

END;
$$;


-- ============================================================================

-- 3. Função que o Agente "Authentication" chama quando recebe o CPF/CNPJ
CREATE OR REPLACE FUNCTION public.mock_validate_identity(
    p_agent_id UUID,
    p_conversation_id UUID,
    p_doc TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_doc TEXT;
    v_is_valid BOOLEAN := false;
    v_session_id UUID;
    v_current_status TEXT;
    v_failed_attempts INT := 0;
BEGIN
    -- Limpa pontuação do documento
    v_clean_doc := regexp_replace(p_doc, '\D', '', 'g');

    -- Verifica se o usuário não está travado (locked)
    SELECT id, status, failed_attempts INTO v_session_id, v_current_status, v_failed_attempts
    FROM public.conversation_security_sessions
    WHERE conversation_id = p_conversation_id 
      AND agent_id = p_agent_id
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_current_status = 'locked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.'
        );
    END IF;

    -- *********************************************************************************
    -- MOCK DE VALIDAÇÃO (No mundo real, aqui você faria uma chamada HTTP ou checaria 
    -- uma tabela de `customers` atrelada ao `tenant` do bot).
    -- Neste MVP, consideramos válido se tiver 11 (CPF) ou 14 (CNPJ) dígitos.
    -- *********************************************************************************
    IF length(v_clean_doc) = 11 OR length(v_clean_doc) = 14 THEN
        v_is_valid := true;
    END IF;

    -- Se válido, autoriza
    IF v_is_valid THEN
        -- Marca a sessão existente como ativa, ou cria uma
        IF v_session_id IS NOT NULL THEN
            UPDATE public.conversation_security_sessions
            SET status = 'active',
                validated_identifier = v_clean_doc,
                failed_attempts = 0,
                expires_at = NOW() + INTERVAL '15 minutes',
                updated_at = NOW()
            WHERE id = v_session_id;
        ELSE
            INSERT INTO public.conversation_security_sessions 
                (conversation_id, agent_id, status, validated_identifier, expires_at)
            VALUES 
                (p_conversation_id, p_agent_id, 'active', v_clean_doc, NOW() + INTERVAL '15 minutes');
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Identidade confirmada com sucesso. Como posso ajudar com sua fatura/dados hoje?',
            'session_identifier', v_clean_doc
        );
    
    -- Se inválido, computa falha
    ELSE
        -- Se não tem sessão, cria uma vazia só pra contar o erro
        IF v_session_id IS NULL THEN
            INSERT INTO public.conversation_security_sessions 
                (conversation_id, agent_id, status, failed_attempts)
            VALUES 
                (p_conversation_id, p_agent_id, 'unauthenticated', 1)
            RETURNING id INTO v_session_id;
            v_failed_attempts := 1;
        ELSE
            v_failed_attempts := v_failed_attempts + 1;
            
            IF v_failed_attempts >= 3 THEN
                -- Sofre um LOCK por 30 minutos
                UPDATE public.conversation_security_sessions
                SET status = 'locked',
                    failed_attempts = v_failed_attempts,
                    locked_until = NOW() + INTERVAL '30 minutes',
                    updated_at = NOW()
                WHERE id = v_session_id;
                
                RETURN jsonb_build_object(
                    'success', false,
                    'message', 'Excesso de tentativas falhas. Conta bloqueada por segurança por 30 minutos.'
                );
            ELSE
                UPDATE public.conversation_security_sessions
                SET failed_attempts = v_failed_attempts,
                    updated_at = NOW()
                WHERE id = v_session_id;
            END IF;
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'message', 'Documento não encontrado ou inválido. Verifique se os números estão corretos e tente novamente.'
        );
    END IF;

END;
$$;
