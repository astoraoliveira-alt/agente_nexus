DO $$
DECLARE
    r RECORD;
    v_msg_id UUID;
BEGIN
    -- Busca TODAS as conversas de hoje que são WhatsApp e não tem janela
    FOR r IN (
        SELECT 
            conv.id as conversation_id,
            conv.tenant_id,
            conv.agent_id,
            conv.user_identifier as phone,
            MIN(m.created_at) as first_msg_time,
            MIN(m.id) as first_msg_id
        FROM conversations conv
        JOIN messages m ON m.conversation_id = conv.id
        WHERE conv.channel = 'whatsapp'
          AND m.created_at >= date_trunc('day', NOW())
          AND NOT EXISTS (
              SELECT 1 FROM whatsapp_billing_windows w
              WHERE w.tenant_id = conv.tenant_id
                AND w.contact_phone = conv.user_identifier
                AND w.window_started_at <= m.created_at
                AND w.window_expires_at >= m.created_at
          )
        GROUP BY conv.id, conv.tenant_id, conv.agent_id, conv.user_identifier
    ) LOOP
        -- Tenta abrir a janela forçadamente
        INSERT INTO public.whatsapp_billing_windows (
            tenant_id, agent_id, conversation_id, first_message_id,
            contact_phone, provider, billing_mode, status,
            window_started_at, window_expires_at, last_activity_at,
            metadata
        ) VALUES (
            r.tenant_id, r.agent_id, r.conversation_id, r.first_msg_id,
            r.phone, 'zenvia', 'window_24h', 'open',
            r.first_msg_time, r.first_msg_time + interval '24 hours', r.first_msg_time,
            '{"force_backfill": "v61_emergency"}'::jsonb
        ) ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
