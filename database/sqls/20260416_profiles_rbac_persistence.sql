-- Persistencia real de perfis/permissoes e vinculo users -> profile_id
-- Executar manualmente no banco antes de publicar o frontend que consome perfis persistidos.

create table if not exists public.profiles (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    description text,
    tenant_id uuid references public.companies(id) on delete cascade,
    is_system boolean not null default false,
    system_key text,
    status text not null default 'active' check (status in ('active', 'inactive')),
    created_by uuid references public.users(id) on delete set null,
    updated_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists profiles_system_key_unique
    on public.profiles(system_key)
    where system_key is not null;

create unique index if not exists profiles_tenant_name_unique
    on public.profiles(tenant_id, lower(name))
    where tenant_id is not null;

create table if not exists public.profile_permissions (
    profile_id uuid not null references public.profiles(id) on delete cascade,
    permission_id text not null,
    created_at timestamptz not null default now(),
    primary key (profile_id, permission_id)
);

alter table public.users
    add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create index if not exists users_profile_id_idx
    on public.users(profile_id);

alter table public.profiles enable row level security;
alter table public.profile_permissions enable row level security;

drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped"
on public.profiles
for select
to authenticated
using (
    public.get_current_user_role() = 'super_admin'
    or tenant_id is null
    or tenant_id = public.get_current_user_tenant_id()
);

drop policy if exists "profiles_insert_scoped" on public.profiles;
create policy "profiles_insert_scoped"
on public.profiles
for insert
to authenticated
with check (
    public.get_current_user_role() = 'super_admin'
    or (
        public.get_current_user_role() = 'tenant_admin'
        and tenant_id = public.get_current_user_tenant_id()
        and is_system = false
    )
);

drop policy if exists "profiles_update_scoped" on public.profiles;
create policy "profiles_update_scoped"
on public.profiles
for update
to authenticated
using (
    public.get_current_user_role() = 'super_admin'
    or (
        public.get_current_user_role() = 'tenant_admin'
        and tenant_id = public.get_current_user_tenant_id()
        and is_system = false
    )
)
with check (
    public.get_current_user_role() = 'super_admin'
    or (
        public.get_current_user_role() = 'tenant_admin'
        and tenant_id = public.get_current_user_tenant_id()
        and is_system = false
    )
);

drop policy if exists "profiles_delete_scoped" on public.profiles;
create policy "profiles_delete_scoped"
on public.profiles
for delete
to authenticated
using (
    public.get_current_user_role() = 'super_admin'
    or (
        public.get_current_user_role() = 'tenant_admin'
        and tenant_id = public.get_current_user_tenant_id()
        and is_system = false
    )
);

drop policy if exists "profile_permissions_select_scoped" on public.profile_permissions;
create policy "profile_permissions_select_scoped"
on public.profile_permissions
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = profile_permissions.profile_id
          and (
            public.get_current_user_role() = 'super_admin'
            or p.tenant_id is null
            or p.tenant_id = public.get_current_user_tenant_id()
          )
    )
);

drop policy if exists "profile_permissions_insert_scoped" on public.profile_permissions;
create policy "profile_permissions_insert_scoped"
on public.profile_permissions
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = profile_permissions.profile_id
          and (
            public.get_current_user_role() = 'super_admin'
            or (
                public.get_current_user_role() = 'tenant_admin'
                and p.tenant_id = public.get_current_user_tenant_id()
                and p.is_system = false
            )
          )
    )
);

drop policy if exists "profile_permissions_delete_scoped" on public.profile_permissions;
create policy "profile_permissions_delete_scoped"
on public.profile_permissions
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = profile_permissions.profile_id
          and (
            public.get_current_user_role() = 'super_admin'
            or (
                public.get_current_user_role() = 'tenant_admin'
                and p.tenant_id = public.get_current_user_tenant_id()
                and p.is_system = false
            )
          )
    )
);

insert into public.profiles (name, description, tenant_id, is_system, system_key, status)
values
    ('Super Admin', 'Acesso global completo ao sistema.', null, true, 'super_admin', 'active'),
    ('Administrador', 'Acesso administrativo completo às telas e ações do tenant.', null, true, 'tenant_admin', 'active'),
    ('Operador', 'Operação diária de conversas, contatos e campanhas.', null, true, 'operator', 'active'),
    ('Visualizador', 'Acesso somente leitura às telas permitidas.', null, true, 'viewer', 'active')
on conflict do nothing;

with system_profile_permissions(system_key, permission_id) as (
    values
        ('super_admin', 'all'),
        ('tenant_admin', 'dashboard.view'),
        ('tenant_admin', 'consumption.view'),
        ('tenant_admin', 'consumption.export'),
        ('tenant_admin', 'conversations.view'),
        ('tenant_admin', 'conversations.takeover'),
        ('tenant_admin', 'conversations.transfer'),
        ('tenant_admin', 'conversations.reply'),
        ('tenant_admin', 'conversations.details'),
        ('tenant_admin', 'contacts.view'),
        ('tenant_admin', 'contacts.create'),
        ('tenant_admin', 'contacts.edit'),
        ('tenant_admin', 'contacts.delete'),
        ('tenant_admin', 'contacts.export'),
        ('tenant_admin', 'agents.view'),
        ('tenant_admin', 'agents.create'),
        ('tenant_admin', 'agents.edit'),
        ('tenant_admin', 'agents.delete'),
        ('tenant_admin', 'agents.history'),
        ('tenant_admin', 'agents.duplicate'),
        ('tenant_admin', 'campaigns.view'),
        ('tenant_admin', 'campaigns.create'),
        ('tenant_admin', 'campaigns.edit'),
        ('tenant_admin', 'campaigns.delete'),
        ('tenant_admin', 'campaigns.import'),
        ('tenant_admin', 'campaigns.view_contacts'),
        ('tenant_admin', 'campaigns.pause'),
        ('tenant_admin', 'crm.view'),
        ('tenant_admin', 'crm.manage_cards'),
        ('tenant_admin', 'crm.edit_stage'),
        ('tenant_admin', 'observatory.view'),
        ('tenant_admin', 'observatory.export'),
        ('tenant_admin', 'quality.view'),
        ('tenant_admin', 'quality.export'),
        ('tenant_admin', 'governance.view'),
        ('tenant_admin', 'governance.manage'),
        ('tenant_admin', 'ai_performance.view'),
        ('tenant_admin', 'ai_performance.export'),
        ('tenant_admin', 'system_status.view'),
        ('tenant_admin', 'users.view'),
        ('tenant_admin', 'users.create'),
        ('tenant_admin', 'users.edit'),
        ('tenant_admin', 'users.delete'),
        ('tenant_admin', 'profiles.view'),
        ('tenant_admin', 'profiles.create'),
        ('tenant_admin', 'profiles.edit'),
        ('tenant_admin', 'profiles.delete'),
        ('tenant_admin', 'settings.view'),
        ('tenant_admin', 'settings.edit'),
        ('operator', 'dashboard.view'),
        ('operator', 'consumption.view'),
        ('operator', 'conversations.view'),
        ('operator', 'conversations.takeover'),
        ('operator', 'conversations.transfer'),
        ('operator', 'conversations.reply'),
        ('operator', 'conversations.details'),
        ('operator', 'contacts.view'),
        ('operator', 'contacts.create'),
        ('operator', 'contacts.edit'),
        ('operator', 'agents.view'),
        ('operator', 'campaigns.view'),
        ('operator', 'campaigns.import'),
        ('operator', 'campaigns.view_contacts'),
        ('operator', 'crm.view'),
        ('operator', 'observatory.view'),
        ('operator', 'quality.view'),
        ('operator', 'governance.view'),
        ('operator', 'ai_performance.view'),
        ('viewer', 'dashboard.view'),
        ('viewer', 'consumption.view'),
        ('viewer', 'conversations.view'),
        ('viewer', 'conversations.details'),
        ('viewer', 'contacts.view'),
        ('viewer', 'agents.view'),
        ('viewer', 'campaigns.view'),
        ('viewer', 'campaigns.view_contacts'),
        ('viewer', 'crm.view'),
        ('viewer', 'observatory.view'),
        ('viewer', 'quality.view'),
        ('viewer', 'governance.view'),
        ('viewer', 'ai_performance.view'),
        ('viewer', 'system_status.view'),
        ('viewer', 'users.view'),
        ('viewer', 'profiles.view'),
        ('viewer', 'settings.view')
)
insert into public.profile_permissions (profile_id, permission_id)
select p.id, spp.permission_id
from system_profile_permissions spp
join public.profiles p on p.system_key = spp.system_key
on conflict do nothing;

update public.users u
set profile_id = p.id
from public.profiles p
where u.profile_id is null
  and p.system_key = u.role;
