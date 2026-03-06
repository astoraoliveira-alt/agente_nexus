-- DIAGNÓSTICO DE SESSÕES
SELECT 
    s.conversation_id, 
    s.agent_id, 
    s.status, 
    s.validated_identifier, 
    s.expires_at, 
    s.updated_at,
    (s.expires_at < now()) as visually_expired,
    now() as db_now
FROM public.conversation_security_sessions s
ORDER BY s.updated_at DESC
LIMIT 10;
