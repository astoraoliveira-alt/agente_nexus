-- Adds billing configuration for WhatsApp Official (Meta/Zenvia) to plans catalog.
-- This is intentionally additive and keeps the existing per-message model as default.

begin;

alter table if exists public.plans
  add column if not exists whatsapp_official_billing_mode text not null default 'per_message',
  add column if not exists whatsapp_window_price numeric not null default 0,
  add column if not exists whatsapp_official_providers jsonb not null default '["meta","zenvia"]'::jsonb;

-- Ensure only known billing modes are used.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_whatsapp_official_billing_mode_check'
  ) then
    alter table public.plans
      add constraint plans_whatsapp_official_billing_mode_check
      check (whatsapp_official_billing_mode in ('per_message', 'window_24h'));
  end if;
end $$;

commit;

