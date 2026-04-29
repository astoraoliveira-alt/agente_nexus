-- ============================================================================
-- TRANSACTIONAL AGENT FRAMEWORK (B2B Identity Gate)
-- MVP Phase 3: Brute-Force & Authentication RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.attempt_session_authentication(
    p_agent_id UUID,
    p_conversation_id UUID,
    p_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_cleaned_identifier TEXT;
BEGIN
    -- 1. Limpa a formatação (ex: tira traços e pontos do CNPJ/CPF)
    v_cleaned_identifier := regexp_replace(p_identifier, '\D', '', 'g');

    -- 2. Busca a sessão atual (criada no passo anterior pelo avaliador ou cria agora)
    SELECT * INTO v_session
    FROM public.conversation_security_sessions
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id;

    IF v_session IS NULL THEN
        -- Cria a sessão já que não existia (caso de edge-case)
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status)
        VALUES (p_conversation_id, p_agent_id, 'unauthenticated')
        RETURNING * INTO v_session;
    END IF;

    -- 3. BRUTE FORCE PROTECTION: Checa se já está travado
    IF v_session.status = 'locked' THEN
        IF v_session.locked_until > now() THEN
            RETURN jsonb_build_object(
                'success', false, 
                'message', 'Security Triggered: Sessão bloqueada por excesso de tentativas. Tente novamente mais tarde.'
            );
        ELSE
            -- O tempo de castigo passou, destrava a sessão
            UPDATE public.conversation_security_sessions 
            SET status = 'unauthenticated', failed_attempts = 0, locked_until = NULL, updated_at = now()
            WHERE id = v_session.id;
            v_session.status := 'unauthenticated';
            v_session.failed_attempts := 0;
        END IF;
    END IF;

    -- 4. IDENTITY VALIDATION (MVP: Sintática simples. No futuro, webhook para API externa do cliente)
    -- Validamos se tem 11 (CPF) ou 14 (CNPJ) números.
    IF length(v_cleaned_identifier) = 11 OR length(v_cleaned_identifier) = 14 THEN
        -- SUCESSO na validação! Ativa a sessão por 1 Hora.
        UPDATE public.conversation_security_sessions
        SET status = 'active', 
            validated_identifier = v_cleaned_identifier,
            failed_attempts = 0,
            expires_at = now() + interval '1 hour',
            updated_at = now()
        WHERE id = v_session.id;

        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Autenticação concluída! O Gatekeeper de Segurança está aberto.'
        );
    ELSE
        -- FALHA na validação! Aplica um "Strike"
        UPDATE public.conversation_security_sessions
        SET failed_attempts = failed_attempts + 1,
            -- Se chegou a 4 falhas (esta é a quinta), trava a sessão.
            status = CASE WHEN failed_attempts + 1 >= 5 THEN 'locked' ELSE 'unauthenticated' END,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
            updated_at = now()
        WHERE id = v_session.id
        RETURNING failed_attempts, status INTO v_session;

        IF v_session.status = 'locked' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'message', 'ACESSO BLOQUEADO: 5 tentativas falhas. A sessão foi trancada por 15 minutos.'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'message', 'Documento inválido. Tentativa ' || v_session.failed_attempts || ' de 5 antes do bloqueio.'
            );
        END IF;
    END IF;
END;
$$;
