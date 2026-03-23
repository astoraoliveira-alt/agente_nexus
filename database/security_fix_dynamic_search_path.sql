-- ================================================================= --
-- DAVOS NEXUS - DYNAMIC SECURITY REPAIR (SEARCH_PATH VULNERABILITY) --
-- ================================================================= --
-- Este script percorre TODAS as funções no esquema 'public' e injeta 
-- 'SET search_path = public' automaticamente, resolvendo todos os 
-- 60+ avisos do Supabase de uma só vez de forma resiliente.

DO $$
DECLARE
    r RECORD;
    v_func_full_name TEXT;
BEGIN
    FOR r IN 
        SELECT 
            p.oid::regprocedure::text as func_sig
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND (p.prokind = 'f' OR p.prokind = 'p') -- Funções e Procedimentos
    LOOP
        v_func_full_name := r.func_sig;
        
        -- Aplica o patch via SQL Dinâmico
        BEGIN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_func_full_name);
            RAISE NOTICE 'Security Patch aplicado: %', v_func_full_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Falha ao aplicar patch em %: %', v_func_full_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────── --
-- AVISO: A configuração "Leaked Password Protection" ainda precisa ser
-- feita manualmente no painel do Supabase (Authentication -> Settings).
-- ─────────────────────────────────────────────────────────────────── --
