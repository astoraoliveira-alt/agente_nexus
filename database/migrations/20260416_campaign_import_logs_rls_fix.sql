-- Corrige RLS de campaign_import_logs para o modelo atual baseado em provider_id/auth.uid()

begin;

alter table if exists public.campaign_import_logs enable row level security;

drop policy if exists "Tenant Access Import Logs" on public.campaign_import_logs;
drop policy if exists "Tenant Read Import Logs" on public.campaign_import_logs;
drop policy if exists "Tenant Insert Import Logs" on public.campaign_import_logs;
drop policy if exists "Tenant Update Import Logs" on public.campaign_import_logs;
drop policy if exists "Tenant Delete Import Logs" on public.campaign_import_logs;

create policy "Tenant Read Import Logs" on public.campaign_import_logs
for select
to authenticated
using (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

create policy "Tenant Insert Import Logs" on public.campaign_import_logs
for insert
to authenticated
with check (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

create policy "Tenant Update Import Logs" on public.campaign_import_logs
for update
to authenticated
using (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
)
with check (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

create policy "Tenant Delete Import Logs" on public.campaign_import_logs
for delete
to authenticated
using (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

commit;
