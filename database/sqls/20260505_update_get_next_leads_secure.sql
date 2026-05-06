-- Update RPC to include campaign and lead metadata for n8n consumption
CREATE OR REPLACE FUNCTION public.get_next_leads_secure(
    p_campaign_id uuid,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    phone text,
    contact_name text,
    campaign_id uuid,
    agent_id uuid,
    tenant_id uuid,
    message text,
    provider text,
    instance text,
    evolution_token text,
    meta_api_token text,
    meta_phone_number_id text,
    zenvia_api_token text,
    zenvia_channel_id text,
    template_id text,
    zenvia_image_url text,
    cta_link text,
    campaign_metadata jsonb,
    lead_metadata jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH selected_leads AS (
        UPDATE public.outbound_queue
        SET status = 'queued',
            updated_at = NOW()
        WHERE id IN (
            SELECT q.id
            FROM public.outbound_queue q
            WHERE q.campaign_id = p_campaign_id
              AND q.status = 'pending'
              AND (q.scheduled_at IS NULL OR q.scheduled_at <= NOW())
            ORDER BY q.created_at ASC
            LIMIT p_limit
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    )
    SELECT 
        sl.id,
        sl.contact_phone::text as phone,
        sl.contact_name::text,
        sl.campaign_id,
        sl.agent_id,
        sl.tenant_id,
        sl.metadata->>'content' as message,
        COALESCE(ag.whatsapp_provider, 'evolution')::text as provider,
        ag.evolution_instance::text as instance,
        ag.evolution_token::text as evolution_token,
        ag.meta_api_token::text as meta_api_token,
        ag.meta_phone_number_id::text as meta_phone_number_id,
        ag.zenvia_api_token::text as zenvia_api_token,
        ag.zenvia_channel_id::text as zenvia_channel_id,
        COALESCE(camp.metadata->>'template_id', '')::text as template_id,
        COALESCE(camp.metadata->>'zenvia_image_url', '')::text as zenvia_image_url,
        COALESCE(sl.metadata->>'cta_link', camp.metadata->>'zenvia_cta_link', '')::text as cta_link,
        camp.metadata as campaign_metadata,
        sl.metadata as lead_metadata
    FROM selected_leads sl
    JOIN public.campaigns camp ON camp.id = sl.campaign_id
    JOIN public.agents ag ON ag.id = sl.agent_id;
END;
$$;
