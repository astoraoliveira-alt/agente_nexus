begin;

alter type public.metric_type add value if not exists 'whatsapp_window_24h';

create table if not exists public.whatsapp_billing_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid null references public.agents(id) on delete set null,
  conversation_id uuid null references public.conversations(id) on delete set null,
  outbound_queue_id uuid null references public.outbound_queue(id) on delete set null,
  first_message_id uuid null,
  last_message_id uuid null,
  contact_phone varchar(50) not null,
  provider varchar(50) not null,
  billing_mode varchar(30) not null default 'window_24h',
  status varchar(20) not null default 'open',
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  consumption_metric_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_billing_windows_status_check check (status in ('open', 'closed')),
  constraint whatsapp_billing_windows_billing_mode_check check (billing_mode in ('window_24h'))
);

create index if not exists idx_wa_billing_windows_lookup
  on public.whatsapp_billing_windows (tenant_id, contact_phone, provider, window_started_at desc);

create unique index if not exists uq_wa_billing_windows_open
  on public.whatsapp_billing_windows (tenant_id, contact_phone, provider)
  where status = 'open';

alter table if exists public.whatsapp_billing_windows enable row level security;

drop policy if exists "Tenant Read WhatsApp Billing Windows" on public.whatsapp_billing_windows;
create policy "Tenant Read WhatsApp Billing Windows" on public.whatsapp_billing_windows
for select
to authenticated
using (
  tenant_id = public.get_auth_tenant_id()
  or public.is_super_admin()
);

drop function if exists public.fn_apply_whatsapp_billing_window();
create or replace function public.fn_apply_whatsapp_billing_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_plan_prices jsonb;
  v_plan_mode text;
  v_plan_window_price numeric;
  v_plan_providers jsonb;
  v_billing_mode text;
  v_window_price numeric;
  v_official_providers jsonb;
  v_provider text;
  v_channel public.conversation_channel;
  v_sent_at timestamptz;
  v_message_id uuid;
  v_message_id_text text;
  v_contact_phone text;
  v_existing_window public.whatsapp_billing_windows%rowtype;
  v_window_id uuid;
  v_consumption_metric_id uuid;
  v_applied_at_text text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = 'sent' or new.status <> 'sent' then
    return new;
  end if;

  if new.tenant_id is null or new.agent_id is null or new.contact_phone is null then
    return new;
  end if;

  v_sent_at := coalesce(new.sent_at, now());
  v_contact_phone := regexp_replace(coalesce(new.contact_phone, ''), '\D', '', 'g');

  if v_contact_phone = '' then
    return new;
  end if;

  select
    c.plan_prices,
    p.whatsapp_official_billing_mode,
    p.whatsapp_window_price,
    p.whatsapp_official_providers,
    case
      when coalesce(a.whatsapp_provider, '') <> '' then lower(a.whatsapp_provider)
      when a.whatsapp_api_type = 'meta_official' then 'meta'
      else 'evolution'
    end
  into
    v_company_plan_prices,
    v_plan_mode,
    v_plan_window_price,
    v_plan_providers,
    v_provider
  from public.companies c
  join public.agents a on a.id = new.agent_id
  left join public.plans p on p.id = c.plan_tier
  where c.id = new.tenant_id;

  v_billing_mode := coalesce(
    v_company_plan_prices->>'whatsappOfficialBillingMode',
    v_company_plan_prices->>'whatsapp_official_billing_mode',
    v_plan_mode,
    'per_message'
  );

  v_window_price := coalesce(
    nullif(v_company_plan_prices->>'whatsappWindowPrice', '')::numeric,
    nullif(v_company_plan_prices->>'whatsapp_window_price', '')::numeric,
    v_plan_window_price,
    0
  );

  v_official_providers := coalesce(
    v_company_plan_prices->'whatsappOfficialProviders',
    v_company_plan_prices->'whatsapp_official_providers',
    v_plan_providers,
    '["meta","zenvia"]'::jsonb
  );

  -- 4. Validação de Canal e Modo
  if lower(coalesce(v_billing_mode, 'per_message')) <> 'window_24h' then
    return new;
  end if;

  -- Se o plano exige janela, e o provedor está vazio, 
  -- assumimos 'official' para garantir a abertura da janela.
  if v_provider = 'evolution' and v_billing_mode = 'window_24h' then
     v_provider := 'official_logic';
  end if;

  -- Permitimos a abertura da janela se o provedor for conhecido como oficial
  -- OU se o modo de faturamento exigir janela (segurança para não cobrar mensagem solta)
  if not exists (
    select 1
    from jsonb_array_elements_text(v_official_providers) as provider_name
    where lower(provider_name) = lower(v_provider)
  ) and v_provider <> 'official_logic' then
    return new;
  end if;

  select coalesce(channel, 'whatsapp'::public.conversation_channel)
  into v_channel
  from public.conversations
  where id = new.conversation_id;

  if coalesce(v_channel, 'whatsapp'::public.conversation_channel) <> 'whatsapp'::public.conversation_channel then
    return new;
  end if;

  update public.whatsapp_billing_windows
  set status = 'closed',
      updated_at = now()
  where tenant_id = new.tenant_id
    and contact_phone = v_contact_phone
    and provider = v_provider
    and status = 'open'
    and window_expires_at <= v_sent_at;

  select *
  into v_existing_window
  from public.whatsapp_billing_windows
  where tenant_id = new.tenant_id
    and contact_phone = v_contact_phone
    and provider = v_provider
    and status = 'open'
    and window_expires_at > v_sent_at
  order by window_started_at desc
  limit 1;

  v_message_id_text := new.metadata->>'message_id';
  if coalesce(v_message_id_text, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_message_id := v_message_id_text::uuid;
  end if;

  if v_existing_window.id is not null then
    v_window_id := v_existing_window.id;

    update public.whatsapp_billing_windows
    set
      outbound_queue_id = new.id,
      last_message_id = coalesce(v_message_id, last_message_id),
      last_activity_at = v_sent_at,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_queue_id', new.id,
        'last_trace_id', new.trace_id,
        'conversation_id', new.conversation_id
      )
    where id = v_window_id;
  else
    insert into public.whatsapp_billing_windows (
      tenant_id,
      agent_id,
      conversation_id,
      outbound_queue_id,
      first_message_id,
      last_message_id,
      contact_phone,
      provider,
      billing_mode,
      status,
      window_started_at,
      window_expires_at,
      last_activity_at,
      metadata
    )
    values (
      new.tenant_id,
      new.agent_id,
      new.conversation_id,
      new.id,
      v_message_id,
      v_message_id,
      v_contact_phone,
      v_provider,
      'window_24h',
      'open',
      v_sent_at,
      v_sent_at + interval '24 hours',
      v_sent_at,
      jsonb_build_object(
        'source', 'outbound_queue_sent',
        'campaign_id', new.campaign_id,
        'trace_id', new.trace_id,
        'queue_id', new.id,
        'conversation_id', new.conversation_id
      )
    )
    returning id into v_window_id;

    insert into public.consumption_metrics (
      tenant_id,
      agent_id,
      channel,
      metric_type,
      value,
      unit,
      cost,
      metadata,
      recorded_at,
      idempotency_key
    )
    values (
      new.tenant_id,
      new.agent_id,
      'whatsapp',
      'whatsapp_window_24h',
      1,
      'window',
      v_window_price,
      jsonb_build_object(
        'window_id', v_window_id,
        'provider', v_provider,
        'billing_mode', 'window_24h',
        'contact_phone', v_contact_phone,
        'first_message_id', v_message_id,
        'conversation_id', new.conversation_id,
        'outbound_queue_id', new.id
      ),
      v_sent_at,
      'wa-window:' || v_window_id::text
    )
    returning id into v_consumption_metric_id;

    update public.whatsapp_billing_windows
    set consumption_metric_id = v_consumption_metric_id
    where id = v_window_id;
  end if;

  update public.outbound_queue
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'billing_mode', 'window_24h',
    'billing_provider', v_provider,
    'billing_window_id', v_window_id,
    'billing_window_started_at', coalesce(v_existing_window.window_started_at, v_sent_at),
    'billing_window_expires_at', coalesce(v_existing_window.window_expires_at, v_sent_at + interval '24 hours')
  )
  where id = new.id;

  if v_message_id is not null then
    update public.messages
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'billing_mode', 'window_24h',
      'billing_provider', v_provider,
      'billing_window_id', v_window_id,
      'billing_window_started_at', coalesce(v_existing_window.window_started_at, v_sent_at),
      'billing_window_expires_at', coalesce(v_existing_window.window_expires_at, v_sent_at + interval '24 hours')
    )
    where id = v_message_id;
  end if;

  if new.conversation_id is not null then
    update public.conversations
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'whatsapp_billing_mode', 'window_24h',
      'whatsapp_billing_provider', v_provider,
      'whatsapp_billing_mode_applied_at', coalesce(metadata->>'whatsapp_billing_mode_applied_at', to_char(v_sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'whatsapp_billing_window_id', v_window_id
    )
    where id = new.conversation_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_whatsapp_billing_window on public.outbound_queue;
create trigger trg_apply_whatsapp_billing_window
after update on public.outbound_queue
for each row
execute function public.fn_apply_whatsapp_billing_window();

commit;
