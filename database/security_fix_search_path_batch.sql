-- ================================================================= --
-- DAVOS NEXUS - SECURITY PATCH: SEARCH_PATH VULNERABILITY           --
-- Data: 2026-03-23                                                  --
-- Objetivo: Resolver 60+ avisos de "Function Search Path Mutable"   --
-- ================================================================= --

-- NOTA: Este script utiliza ALTER FUNCTION para injetar o search_path
-- sem a necessidade de redefinir o corpo das funções, garantindo segurança.

-- ─────────────────────────────────────────────────────────────────── --
-- 1. FIX: CORE FUNCTIONS & AUTH                                       --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.evaluate_conversation_security(uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.sync_vapi_call(jsonb) SET search_path = public;
ALTER FUNCTION public.calculate_message_cost(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.is_super_admin(uuid) SET search_path = public;
ALTER FUNCTION public.attempt_session_authentication(text, text) SET search_path = public;
ALTER FUNCTION public.clean_message_content(text) SET search_path = public;
ALTER FUNCTION public.get_auth_tenant_id() SET search_path = public;
ALTER FUNCTION public.get_conversation_cost(uuid) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- 2. FIX: AI PERFORMANCE CENTER RPCs                                  --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.fn_ai_perf_economics(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.fn_ai_perf_security(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.fn_ai_perf_optimization(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.fn_ai_perf_knowledge(uuid, timestamptz, timestamptz) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- 3. FIX: MISSION CONTROL & QUEUE                                     --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.fn_get_queue_health_stats(uuid) SET search_path = public;
ALTER FUNCTION public.fn_get_error_root_causes(uuid) SET search_path = public;
ALTER FUNCTION public.fn_retry_failed_message(uuid) SET search_path = public;
ALTER FUNCTION public.fn_log_dlq_error(uuid, text, jsonb) SET search_path = public;
ALTER FUNCTION public.fn_log_queue_error(uuid, text, jsonb) SET search_path = public;
ALTER FUNCTION public.fn_cleanup_stuck_inbound_messages(int) SET search_path = public;
ALTER FUNCTION public.fn_fetch_next_inbound_message(int) SET search_path = public;
ALTER FUNCTION public.fn_finish_inbound_message(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.fn_enqueue_inbound_message(uuid, uuid, text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.fn_track_inbound_queue_errors(uuid, uuid, text, jsonb) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- 4. FIX: ORCHESTRATION & AGENTS                                      --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.fn_get_agent_context(uuid) SET search_path = public;
ALTER FUNCTION public.fn_get_agent_context(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.fn_register_agent_response(uuid, uuid, text, jsonb) SET search_path = public;
ALTER FUNCTION public.enforce_agent_hierarchy_depth() SET search_path = public;
ALTER FUNCTION public.sync_child_agent_status(uuid, text) SET search_path = public;
ALTER FUNCTION public.match_agent_knowledge(uuid, vector, float, int) SET search_path = public;
ALTER FUNCTION public.close_idle_conversations(int) SET search_path = public;
ALTER FUNCTION public.get_or_create_conversation(uuid, uuid, text) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- 5. FIX: ANALYTICS & MONITORING                                      --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.fn_get_trace_lifecycle(uuid) SET search_path = public;
ALTER FUNCTION public.fn_track_llm_usage(uuid, uuid, text, int, int, float) SET search_path = public;
ALTER FUNCTION public.record_usage(uuid, text, int) SET search_path = public;
ALTER FUNCTION public.record_security_violation(uuid, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.fn_log_event(uuid, text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.get_companies_overview() SET search_path = public;
ALTER FUNCTION public.get_financial_report(timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.fn_get_mission_control_v2(uuid) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- 6. FIX: AUDIT & VAPI                                                --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.audit_voice_conversation_granular(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.sync_vapi_full_audit(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.sync_vapi_full_audit_v2(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.get_conversation_transcript(uuid) SET search_path = public;
ALTER FUNCTION public.get_pending_audits(int) SET search_path = public;
ALTER FUNCTION public.update_conversation_artifacts_modtime() SET search_path = public;
ALTER FUNCTION public.handle_incident_reputation(uuid, int) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- 7. FIX: N8N ORCHESTRATORS                                           --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.n8n_orchestrator_v4(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.n8n_orchestrator_v5(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.n8n_orchestrator_v6(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.n8n_orchestrator_v7(uuid, jsonb) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- 8. FIX: MOCKS & HELPERS                                             --
-- ─────────────────────────────────────────────────────────────────── --
ALTER FUNCTION public.mock_inform_payment(uuid, uuid, float) SET search_path = public;
ALTER FUNCTION public.mock_renegotiate_debts(uuid, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.mock_get_customer_summary(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.mock_validate_identity(uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.financial_get_customer_summary_safe(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.fn_get_error_root_causes(uuid) SET search_path = public;
ALTER FUNCTION public.fn_bind_execution(uuid, uuid) SET search_path = public;

-- ─────────────────────────────────────────────────────────────────── --
-- FINALIZAÇÃO                                                         --
-- ─────────────────────────────────────────────────────────────────── --
DO $$ 
BEGIN 
    RAISE NOTICE 'Patch de Segurança aplicado com sucesso em todas as funções detectadas.';
END $$;
