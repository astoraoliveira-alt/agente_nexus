begin;

drop function if exists public.get_detailed_consumption(uuid, int);
create or replace function public.get_detailed_consumption(
    p_tenant_id uuid,
    p_days int
)
returns table (
    id uuid,
    agent_id uuid,
    agent_name varchar,
    channel varchar,
    metric_type varchar,
    value numeric,
    cost numeric,
    recorded_at timestamptz
)
language plpgsql
security definer
as $$
declare
    v_msg_price numeric;
begin
    select coalesce((c.plan_prices->>'message_flat')::numeric, p.message_price, 0)
    into v_msg_price
    from public.companies c
    left join public.plans p on c.plan_tier = p.id
    where c.id = p_tenant_id;

    return query
    select
        cm.id,
        cm.agent_id,
        a.name as agent_name,
        cm.channel::varchar,
        cm.metric_type::varchar,
        cm.value,
        cm.cost,
        cm.recorded_at
    from public.consumption_metrics cm
    left join public.agents a on cm.agent_id = a.id
    where cm.tenant_id = p_tenant_id
      and cm.recorded_at >= now() - (p_days || ' days')::interval
      and cm.metric_type != 'messages'

    union all

    select
        null::uuid as id,
        conv.agent_id,
        coalesce(a.name, 'Agente')::varchar as agent_name,
        coalesce(conv.channel::varchar, 'whatsapp')::varchar as channel,
        'messages'::varchar as metric_type,
        count(*)::numeric as value,
        (count(*) * v_msg_price)::numeric as cost,
        date_trunc('hour', m.created_at) as recorded_at
    from public.messages m
    left join public.conversations conv on m.conversation_id = conv.id
    left join public.agents a on conv.agent_id = a.id
    where m.tenant_id = p_tenant_id
      and m.created_at >= now() - (p_days || ' days')::interval
      and not (
        conv.channel = 'whatsapp'::public.conversation_channel
        and coalesce(conv.metadata->>'whatsapp_billing_mode', '') = 'window_24h'
        and m.created_at >= coalesce(
          nullif(conv.metadata->>'whatsapp_billing_mode_applied_at', '')::timestamptz,
          conv.created_at,
          now() - (p_days || ' days')::interval
        )
      )
    group by conv.agent_id, a.name, conv.channel, date_trunc('hour', m.created_at)
    order by recorded_at desc;
end;
$$;

drop function if exists public.get_tenant_usage_summary(uuid, int, int);
create or replace function public.get_tenant_usage_summary(
    p_tenant_id uuid,
    p_month int,
    p_year int
)
returns table (
    total_tokens numeric,
    stt_minutes numeric,
    tts_minutes numeric,
    total_messages bigint,
    total_whatsapp_windows bigint,
    active_agents bigint
)
language plpgsql
security definer
as $$
declare
    v_start_date timestamptz;
    v_end_date timestamptz;
begin
    v_start_date := make_timestamptz(p_year, p_month, 1, 0, 0, 0);
    v_end_date := v_start_date + interval '1 month';

    return query
    with metrics as (
        select
            coalesce(sum(case when metric_type = 'tokens' then value else 0 end), 0) as tokens,
            coalesce(sum(case when metric_type = 'stt_minutes' then value else 0 end), 0) as stt,
            coalesce(sum(case when metric_type = 'tts_minutes' then value else 0 end), 0) as tts,
            coalesce(sum(case when metric_type = 'whatsapp_window_24h' then value else 0 end), 0) as wa_windows
        from public.consumption_metrics
        where tenant_id = p_tenant_id
          and recorded_at >= v_start_date
          and recorded_at < v_end_date
    ),
    message_count as (
        select count(*) as count
        from public.messages m
        left join public.conversations conv on m.conversation_id = conv.id
        where m.tenant_id = p_tenant_id
          and m.created_at >= v_start_date
          and m.created_at < v_end_date
          and not (
            conv.channel = 'whatsapp'::public.conversation_channel
            and coalesce(conv.metadata->>'whatsapp_billing_mode', '') = 'window_24h'
            and m.created_at >= coalesce(
              nullif(conv.metadata->>'whatsapp_billing_mode_applied_at', '')::timestamptz,
              conv.created_at,
              v_start_date
            )
          )
    ),
    agent_count as (
        select count(*) as count
        from public.agents
        where tenant_id = p_tenant_id
          and status = 'active'
    )
    select
        m.tokens,
        m.stt,
        m.tts,
        mc.count,
        m.wa_windows::bigint,
        ac.count
    from metrics m
    cross join message_count mc
    cross join agent_count ac;
end;
$$;

drop function if exists public.get_financial_report(integer, integer);
create or replace function public.get_financial_report(
    p_month int,
    p_year int
)
returns table (
    tenant_id uuid,
    company_name text,
    plan_name text,
    revenue_fixed numeric,
    revenue_variable numeric,
    cost_fixed numeric,
    cost_variable_llm numeric,
    cost_variable_voice numeric,
    cost_variable_other numeric,
    net_margin numeric
)
language plpgsql
security definer
as $$
declare
    v_start_date timestamptz;
    v_end_date timestamptz;
begin
    v_start_date := make_timestamptz(p_year, p_month, 1, 0, 0, 0);
    v_end_date := v_start_date + interval '1 month';

    return query
    with revenue_metrics as (
        select
            cm.tenant_id,
            coalesce(sum(case when cm.metric_type = 'tokens' then cm.value else 0 end), 0) as val_llm,
            coalesce(sum(case when cm.metric_type = 'stt_minutes' then cm.value else 0 end), 0) as val_stt,
            coalesce(sum(case when cm.metric_type = 'tts_minutes' then cm.value else 0 end), 0) as val_tts,
            coalesce(sum(case when cm.metric_type = 'messages' then cm.value else 0 end), 0) as val_msgs_recorded,
            coalesce(sum(case when cm.metric_type = 'whatsapp_window_24h' then cm.value else 0 end), 0) as val_wa_windows
        from public.consumption_metrics cm
        where cm.recorded_at >= v_start_date and cm.recorded_at < v_end_date
        group by cm.tenant_id
    ),
    message_counts as (
        select
            m.tenant_id,
            count(*) as total_msgs
        from public.messages m
        left join public.conversations conv on m.conversation_id = conv.id
        where m.created_at >= v_start_date and m.created_at < v_end_date
          and not (
            conv.channel = 'whatsapp'::public.conversation_channel
            and coalesce(conv.metadata->>'whatsapp_billing_mode', '') = 'window_24h'
            and m.created_at >= coalesce(
              nullif(conv.metadata->>'whatsapp_billing_mode_applied_at', '')::timestamptz,
              conv.created_at,
              v_start_date
            )
          )
        group by m.tenant_id
    ),
    tenant_fixed_costs as (
        select
            cdc.tenant_id,
            coalesce(sum(case when cdc.is_recurring = true then cdc.cost_value else 0 end), 0) as total_fixed_cost
        from public.company_davos_costs cdc
        group by cdc.tenant_id
    ),
    tenant_rates as (
        select
            cdc.tenant_id,
            max(case when cdc.item_key = 'llm_internal_rate' then cdc.cost_value else 0 end) as llm_rate,
            max(case when cdc.item_key = 'voice_internal_rate' then cdc.cost_value else 0 end) as voice_rate,
            max(case when cdc.item_key = 'twilio_variable' then cdc.cost_value else 0 end) as twilio_var_rate,
            max(case when cdc.item_key = 'msg_whatsapp' then cdc.cost_value else 0 end) as whatsapp_rate
        from public.company_davos_costs cdc
        group by cdc.tenant_id
    ),
    raw_calculations as (
        select
            c.id as raw_tenant_id,
            c.name::text as raw_company_name,
            p.name::text as raw_plan_name,
            coalesce(p.base_price, 0)::numeric as raw_revenue_fixed,
            coalesce(p.monthly_fee_covers_usage, false) as raw_monthly_fee_covers_usage,
            (
                (coalesce(rm.val_llm, 0) / 1000.0 * coalesce(p.llm_token_price, 0)) +
                (coalesce(rm.val_stt, 0) * coalesce(p.stt_minute_price, 0)) +
                (coalesce(rm.val_tts, 0) * coalesce(p.tts_minute_price, 0)) +
                (coalesce(rm.val_msgs_recorded, 0) * coalesce(p.message_price, 0)) +
                (coalesce(mc.total_msgs, 0) * coalesce(p.message_price, 0)) +
                (
                  coalesce(rm.val_wa_windows, 0) * coalesce(
                    nullif(c.plan_prices->>'whatsappWindowPrice', '')::numeric,
                    nullif(c.plan_prices->>'whatsapp_window_price', '')::numeric,
                    p.whatsapp_window_price,
                    0
                  )
                )
            ) as raw_revenue_variable,
            coalesce(tfc.total_fixed_cost, 0) as raw_cost_fixed,
            ((coalesce(rm.val_llm, 0) / 1000.0) * coalesce(tr.llm_rate, 0.05)) as raw_cost_variable_llm,
            ((coalesce(rm.val_stt, 0) + coalesce(rm.val_tts, 0)) * coalesce(tr.voice_rate, 0.15)) as raw_cost_variable_voice,
            ((coalesce(rm.val_stt, 0) + coalesce(rm.val_tts, 0)) * coalesce(tr.twilio_var_rate, 0)) as raw_cost_variable_other,
            ((coalesce(rm.val_msgs_recorded, 0) + coalesce(mc.total_msgs, 0) + coalesce(rm.val_wa_windows, 0)) * coalesce(tr.whatsapp_rate, 0.05)) as raw_cost_variable_whatsapp
        from public.companies c
        left join public.plans p on c.plan_tier = p.id
        left join revenue_metrics rm on c.id = rm.tenant_id
        left join message_counts mc on c.id = mc.tenant_id
        left join tenant_fixed_costs tfc on c.id = tfc.tenant_id
        left join tenant_rates tr on c.id = tr.tenant_id
    )
    select
        raw_tenant_id as tenant_id,
        raw_company_name as company_name,
        raw_plan_name as plan_name,
        raw_revenue_fixed as revenue_fixed,
        round((
            case
                when raw_monthly_fee_covers_usage then greatest(0, raw_revenue_variable - raw_revenue_fixed)
                else raw_revenue_variable
            end
        ), 2)::numeric as revenue_variable,
        round(raw_cost_fixed, 2)::numeric as cost_fixed,
        round(raw_cost_variable_llm, 2)::numeric as cost_variable_llm,
        round(raw_cost_variable_voice, 2)::numeric as cost_variable_voice,
        round(raw_cost_variable_other + raw_cost_variable_whatsapp, 2)::numeric as cost_variable_other,
        round((
            raw_revenue_fixed +
            case
                when raw_monthly_fee_covers_usage then greatest(0, raw_revenue_variable - raw_revenue_fixed)
                else raw_revenue_variable
            end
        ) - (
            raw_cost_fixed + raw_cost_variable_llm + raw_cost_variable_voice + raw_cost_variable_other + raw_cost_variable_whatsapp
        ), 2)::numeric as net_margin
    from raw_calculations
    order by 10 desc;
end;
$$;

commit;

