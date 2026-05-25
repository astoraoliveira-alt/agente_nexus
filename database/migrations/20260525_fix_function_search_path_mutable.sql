-- ================================================================= --
-- DAVOS NEXUS - AUTOMATED SECURITY PATH STABILIZATION               --
-- Date: 2026-05-25                                                  --
-- Version: 1.1 (Safe Linter Remediation)                            --
-- ================================================================= --

-- Safe stabilization of search_path on all SECURITY DEFINER functions
DO $$ 
DECLARE 
    r RECORD;
    v_count INT := 0;
BEGIN
    FOR r IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions', r.nspname, r.proname, r.args);
        v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE 'Stabilized search_path = public, extensions on % SECURITY DEFINER functions.', v_count;
END $$;
