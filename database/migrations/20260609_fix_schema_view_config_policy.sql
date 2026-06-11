-- Fix RLS Policy for schema_view_config to use project-standard helpers
DROP POLICY IF EXISTS "tenant_rw" ON public.schema_view_config;

CREATE POLICY "tenant_rw" ON public.schema_view_config
  FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
  );
