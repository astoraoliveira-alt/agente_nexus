-- ==============================================================================
-- MIGRATION: 20260925_fix_messages_tenant_rls_policy.sql
-- Descrição:
--   Corrige a política RLS da tabela 'messages' para permitir que operadores
--   e usuários autenticados do tenant consigam visualizar as mensagens das conversas.
--   A política anterior verificava (auth.jwt() ->> 'tenant_id'), que não é injetado
--   no topo do JWT padrão do Supabase, bloqueando operadores não super_admin.
--   Agora utiliza get_auth_tenant_id() e get_current_user_tenant_id() em alinhamento
--   com as tabelas 'conversations', 'outbound_queue' e 'agent_leads'.
-- ==============================================================================

-- 1. Remover política restritiva anterior
DROP POLICY IF EXISTS "Tenant Access Messages" ON public.messages;

-- 2. Recriar política compatível com get_auth_tenant_id() e roles do tenant
CREATE POLICY "Tenant Access Messages" ON public.messages
FOR ALL
TO authenticated
USING (
  tenant_id = get_auth_tenant_id()
  OR tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())
  OR is_super_admin()
)
WITH CHECK (
  tenant_id = get_auth_tenant_id()
  OR tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())
  OR is_super_admin()
);

-- Recarregar cache de schema
NOTIFY pgrst, 'reload schema';
