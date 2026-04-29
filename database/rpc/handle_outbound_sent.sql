-- ========================================================== --
-- DAVOS NEXUS - HANDLE_OUTBOUND_SENT (V5.4)                 --
-- Cleanup and Strict n8n Compatibility                      --
-- ========================================================== --

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'handle_outbound_sent' AND pronamespace = 'public'::regnamespace) 
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.handle_outbound_sent(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_contact_phone text,
    p_contact_name text,
    p_message_content text,
    p_queue_id uuid,
    p_campaign_id uuid,
    p_message_type text DEFAULT 'text',
    p_remote_id text DEFAULT NULL,
    p_channel public.conversation_channel DEFAULT 'whatsapp'::public.conversation_channel,
    p_trace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id uuid;
    v_message_id uuid;
    v_clean_phone text;
BEGIN
    v_clean_phone := regexp_replace(p_contact_phone, '\D', '', 'g');

    INSERT INTO public.conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, last_message_at)
    VALUES (p_tenant_id, p_agent_id, v_clean_phone, p_contact_name, COALESCE(p_channel, 'whatsapp'::public.conversation_channel), 'ai_active', NOW())
    ON CONFLICT (tenant_id, agent_id, user_identifier) 
    DO UPDATE SET status = 'ai_active', last_message_at = NOW(), updated_at = NOW()
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.messages (tenant_id, conversation_id, content, direction, message_type, sender_type, remote_id, trace_id, metadata)
    VALUES (p_tenant_id, v_conversation_id, p_message_content, 'outbound', p_message_type, 'agent', p_remote_id, p_trace_id, jsonb_build_object('campaign_id', p_campaign_id, 'queue_id', p_queue_id))
    RETURNING id INTO v_message_id;

    IF p_queue_id IS NOT NULL THEN
        UPDATE public.outbound_queue SET status = 'sent', sent_at = NOW(), conversation_id = v_conversation_id, metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('message_id', v_message_id) WHERE id = p_queue_id;
    END IF;

    IF p_campaign_id IS NOT NULL THEN PERFORM public.fn_sync_campaign_stats(p_campaign_id); END IF;

    RETURN jsonb_build_object('success', true, 'conversation_id', v_conversation_id, 'message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_outbound_sent TO authenticated, service_role;
