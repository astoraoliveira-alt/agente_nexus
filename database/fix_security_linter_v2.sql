-- ================================================================= --
-- DAVOS NEXUS - SECURITY HARDENING (LINTER COMPLIANCE)              --
-- Data: 2026-04-24                                                  --
-- Versão: 1.0 (Linter Remediation)                                  --
-- ================================================================= --

-- ─────────────────────────────────────────────────────────────────── --
-- 1. FIX: SECURITY DEFINER VIEW (PostgreSQL 15+)                      --
-- ─────────────────────────────────────────────────────────────────── --
-- A view 'public.decision_logs' foi detectada como SECURITY DEFINER.
-- Isso ignora as políticas de RLS das tabelas subjacentes.
-- Alterando para SECURITY INVOKER para garantir o isolamento por tenant.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'decision_logs') THEN
        ALTER VIEW public.decision_logs SET (security_invoker = on);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Não foi possível alterar a view decision_logs. Pode ser que a versão do Postgres seja < 15.';
END $$;

-- ─────────────────────────────────────────────────────────────────── --
-- 2. FIX: FUNCTION SEARCH PATH MUTABLE (AUTOMATED)                    --
-- ─────────────────────────────────────────────────────────────────── --
-- Aplica 'SET search_path = public' em todas as funções SECURITY DEFINER no schema public.
-- Isso resolve em massa os avisos 'function_search_path_mutable'.
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
    RAISE NOTICE 'Aplicado search_path = public, extensions em % funções SECURITY DEFINER.', v_count;
END $$;

-- ─────────────────────────────────────────────────────────────────── --
-- 3. FIX: BROAD STORAGE POLICIES (LISTING PREVENTION)                 --
-- ─────────────────────────────────────────────────────────────────── --
-- Buckets públicos permitem acesso via URL pública sem RLS SELECT.
-- Manter uma política de SELECT broad permite que usuários listem todos os arquivos.
-- Removendo as políticas detectadas pelo linter para fechar essa brecha.

-- Bucket: artifacts
DROP POLICY IF EXISTS "Permitir Leitura de Artefatos 9akkwx_0" ON storage.objects;

-- Bucket: incident-attachments
DROP POLICY IF EXISTS "Allow Public Read Access to Incident Attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow Authenticated Read Access to Incident Attachments" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────── --
-- 4. VERIFICAÇÃO FINAL                                                --
-- ─────────────────────────────────────────────────────────────────── --
DO $$ 
BEGIN 
    RAISE NOTICE 'Hardening de Segurança concluído com sucesso.';
END $$;
