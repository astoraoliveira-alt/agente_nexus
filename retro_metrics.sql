-- =========================================================
-- PATCH: Restore missing consumption_metrics for old calls
-- =========================================================
INSERT INTO consumption_metrics (
    tenant_id, agent_id, channel, metric_type, value, cost, recorded_at, metadata
)
SELECT 
    tenant_id,
    COALESCE(
        (payload->'message'->'call'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (payload->'message'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (SELECT id FROM agents WHERE tenant_id = integration_logs.tenant_id LIMIT 1)
    ) as agent_id,
    'voice'::conversation_channel,
    'stt_minutes'::metric_type,
    ((payload->'message'->>'durationSeconds')::NUMERIC / 60.0) as value,
    0 as cost, -- approximate
    processed_at,
    jsonb_build_object('vapi_call_id', external_id, 'type', 'stt_sync_restored')
FROM integration_logs
WHERE provider = 'vapi' AND status = 'success'
  AND (payload->'message'->>'durationSeconds') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM consumption_metrics cm 
      WHERE cm.metadata->>'vapi_call_id' = integration_logs.external_id 
        AND cm.metric_type = 'stt_minutes'
  );

INSERT INTO consumption_metrics (
    tenant_id, agent_id, channel, metric_type, value, cost, recorded_at, metadata
)
SELECT 
    tenant_id,
    COALESCE(
        (payload->'message'->'call'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (payload->'message'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (SELECT id FROM agents WHERE tenant_id = integration_logs.tenant_id LIMIT 1)
    ) as agent_id,
    'voice'::conversation_channel,
    'tts_minutes'::metric_type,
    ((payload->'message'->>'durationSeconds')::NUMERIC / 60.0) as value,
    0 as cost, -- approximate
    processed_at,
    jsonb_build_object('vapi_call_id', external_id, 'type', 'tts_sync_restored')
FROM integration_logs
WHERE provider = 'vapi' AND status = 'success'
  AND (payload->'message'->>'durationSeconds') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM consumption_metrics cm 
      WHERE cm.metadata->>'vapi_call_id' = integration_logs.external_id 
        AND cm.metric_type = 'tts_minutes'
  );

INSERT INTO consumption_metrics (
    tenant_id, agent_id, channel, metric_type, value, cost, recorded_at, metadata
)
SELECT 
    tenant_id,
    COALESCE(
        (payload->'message'->'call'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (payload->'message'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (SELECT id FROM agents WHERE tenant_id = integration_logs.tenant_id LIMIT 1)
    ) as agent_id,
    'voice'::conversation_channel,
    'tokens'::metric_type,
    COALESCE((payload->'message'->'costBreakdown'->>'llmPromptTokens')::NUMERIC, 0) + COALESCE((payload->'message'->'costBreakdown'->>'llmCompletionTokens')::NUMERIC, 0) as value,
    0 as cost, -- approximate
    processed_at,
    jsonb_build_object('vapi_call_id', external_id, 'type', 'llm_sync_restored')
FROM integration_logs
WHERE provider = 'vapi' AND status = 'success'
  AND payload->'message'->'costBreakdown' IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM consumption_metrics cm 
      WHERE cm.metadata->>'vapi_call_id' = integration_logs.external_id 
        AND cm.metric_type = 'tokens'
  );
