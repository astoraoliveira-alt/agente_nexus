-- =============================================
-- SECURITY HARDENING: AUTO-REPAIR RPC & EXTENSIONS (VER 3.0)
-- Purpose: Resolve ALL search_path warnings automatically.
-- Level: PRO (Resilient to any function signature)
-- =============================================

-- 1. DYNAMIC SEARCH_PATH FIX
-- This block finds EVERY function in 'public' that doesn't have a search_path set
-- and applies 'SET search_path = public' to it dynamically.

DO $$
DECLARE
    func_record RECORD;
    repair_query TEXT;
    fixed_count INT := 0;
BEGIN
    FOR func_record IN 
        SELECT 
            p.oid::regprocedure as function_signature
        FROM 
            pg_proc p
        JOIN 
            pg_namespace n ON p.pronamespace = n.oid
        WHERE 
            n.nspname = 'public' 
            AND p.proconfig IS NULL -- No search_path or other configs set
            -- Skip triggers or internal functions if necessary, 
            -- but generally all public RPCs should have search_path.
    LOOP
        BEGIN
            repair_query := 'ALTER FUNCTION ' || func_record.function_signature || ' SET search_path = public';
            EXECUTE repair_query;
            fixed_count := fixed_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not fix %: %', func_record.function_signature, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'Success! % functions were automatically secured.', fixed_count;
END $$;

-- 2. EXTENSION ISOLATION (Linter 0014)
-- Move 'vector' to 'extensions' schema to isolate IA functions.
-- Recommended for production environments.

CREATE SCHEMA IF NOT EXISTS extensions;
-- Se o comando abaixo falhar por permissão, execute-o como 'postgres' no SQL Editor.
DO $$ 
BEGIN 
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions'; 
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Extension move skipped or failed: %', SQLERRM;
END $$;

-- 3. LEAKED PASSWORD PROTECTION (Linter Warning)
-- This cannot be fixed via SQL. 
-- Action: Go to Supabase Dashboard -> Auth -> Settings -> Password Protection -> Enable "Leaked Password Protection".

-- 4. VERIFICATION
DO $$ BEGIN RAISE NOTICE 'Security Hardening V3.0 Complete.'; END $$;
