const fs = require('fs');
const https = require('https');
const path = require('path');

const envPath = path.join(__dirname, 'porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const reqOptions = {
    hostname: url.replace('https://', ''),
    path: '/rest/v1/rpc/test_query_raw',
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
};

const sql = `
CREATE OR REPLACE FUNCTION test_query_raw() RETURNS jsonb AS $$
DECLARE
    res jsonb;
BEGIN
    SELECT jsonb_agg(oq.id) INTO res
    FROM public.outbound_queue oq
    JOIN public.campaigns camp ON camp.id = oq.campaign_id
    WHERE oq.contact_phone = '5511993434870'
      AND camp.name ILIKE '%teste novo%'
      AND COALESCE(oq.scheduled_at, NOW()) <= NOW()
      AND (
          oq.status = 'pending'
          OR 
          (
              camp.reengagement_enabled = true
              AND oq.status IN ('sent', 'delivered', 'read')
              AND oq.response_detected = false
          )
      )
      -- AND (
      --     COALESCE((camp.capping_config->>'override_for_incidents')::boolean, false) = true
      --     OR NOT EXISTS (SELECT 1 FROM public.contact_pressure_logs cpl WHERE cpl.tenant_id = oq.tenant_id AND cpl.contact_phone = oq.contact_phone AND cpl.sent_at > NOW() - (COALESCE(camp.capping_config->>'cooldown_hours', '24')::int || ' hours')::interval)
      -- )
      AND NOT (
          trim(lower(oq.status)) = 'converted' 
          OR (oq.metadata IS NOT NULL AND (oq.metadata->>'converted') = 'true') 
          OR EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = oq.conversation_id AND m.content ILIKE '%[CONVERSÃO]%' AND m.created_at >= COALESCE(oq.sent_at, oq.created_at))
          OR ('CLIENT_RESPONDED' = ANY(COALESCE(camp.success_criteria, '{}'::text[])) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = oq.conversation_id AND m.sender_type = 'user' AND m.direction = 'inbound' AND m.created_at >= COALESCE(oq.sent_at, oq.created_at)))
          OR ('LINK_SENT' = ANY(COALESCE(camp.success_criteria, '{}'::text[])) AND COALESCE(camp.success_link_filter, '') <> '' AND EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = oq.conversation_id AND (m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system') AND m.content ILIKE '%' || camp.success_link_filter || '%') AND m.created_at >= COALESCE(oq.sent_at, oq.created_at)))
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.outbound_queue oq_check WHERE oq_check.tenant_id = oq.tenant_id AND oq_check.contact_phone = oq.contact_phone AND (oq_check.status = 'sent' OR oq_check.status = 'processing') AND (oq_check.id <> oq.id) AND (oq_check.sent_at > (NOW() - INTERVAL '2 hours') OR (oq_check.status = 'processing' AND oq_check.last_attempt_at > NOW() - INTERVAL '30 minutes'))
      );
    RETURN res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

console.log("SQL Created...");
