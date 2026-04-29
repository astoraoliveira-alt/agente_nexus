-- RLS para permitir leitura/escrita de agent_leads por tenant e super_admin

begin;

alter table if exists public.agent_leads enable row level security;

drop policy if exists "Tenant Read Agent Leads" on public.agent_leads;
drop policy if exists "Tenant Insert Agent Leads" on public.agent_leads;
drop policy if exists "Tenant Update Agent Leads" on public.agent_leads;
drop policy if exists "Tenant Delete Agent Leads" on public.agent_leads;

create policy "Tenant Read Agent Leads" on public.agent_leads
for select
to authenticated
using (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

create policy "Tenant Insert Agent Leads" on public.agent_leads
for insert
to authenticated
with check (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

create policy "Tenant Update Agent Leads" on public.agent_leads
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

create policy "Tenant Delete Agent Leads" on public.agent_leads
for delete
to authenticated
using (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

commit;
