-- =============================================
-- SECURITY AUDIT FIX: RPC Hardening (Bulletproof Version)
-- Purpose: Prevent search_path hijacking in SECURITY DEFINER functions
-- Strategy: Use dynamic SQL to detect signatures and apply fixes safely
-- =============================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Lista de funções críticas para auditoria e hardening
    -- Buscamos pelo nome e aplicamos o search_path independentemente da assinatura (args)
    FOR r IN 
        SELECT 
            n.nspname as schema_name, 
            p.proname as function_name, 
            pg_get_function_identity_arguments(p.oid) as arguments
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.proname IN (
            'evaluate_conversation_security', 
            'mock_validate_identity', 
            'sync_vapi_call', 
            'get_or_create_conversation',
            'close_idle_conversations',
            'get_conversation_transcript',
            'n8n_orchestrator_v5',
            'n8n_orchestrator_v6',
            'record_usage'
        )
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
                           r.schema_name, r.function_name, r.arguments);
            RAISE NOTICE 'Proteção aplicada com sucesso: %', r.function_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Falha ao aplicar proteção em %: %', r.function_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- Verificação Final
SELECT 
    proname as function_name, 
    proconfig as security_config 
FROM pg_proc 
WHERE proname IN (
    'evaluate_conversation_security', 
    'mock_validate_identity', 
    'sync_vapi_call', 
    'get_conversation_transcript'
);
