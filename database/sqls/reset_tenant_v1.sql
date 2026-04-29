-- RESET TENANT DATA SCRIPT (V1)
-- File: database/reset_tenant_v1.sql
-- Description: Completely resets all operational and historical data for a specific tenant.
-- Usage: Replace the UUID below and run in Supabase SQL Editor.

DO $$ 
DECLARE 
    v_tenant_id UUID := 'd290f1ee-6c54-4b01-90e6-d701748f0851';
BEGIN
    -- 0. Ensure deletion is allowed for Realtime-monitored tables (Fix Error 55000)
    EXECUTE 'ALTER TABLE public.incidents REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.messages REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.conversations REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.inbound_queue REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.inbound_queue_errors REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.agent_responses_queue REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.outbound_queue REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.integration_logs REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.system_logs REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.audit_logs REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.consumption_metrics REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.agent_success_memory REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.evaluations REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.conversation_artifacts REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.contacts REPLICA IDENTITY FULL';

    -- 1. Clear Operational Queues & Buffers
    DELETE FROM public.inbound_queue WHERE tenant_id = v_tenant_id;
    DELETE FROM public.inbound_queue_errors WHERE tenant_id = v_tenant_id;
    DELETE FROM public.agent_responses_queue WHERE tenant_id = v_tenant_id;
    DELETE FROM public.outbound_queue WHERE tenant_id = v_tenant_id;

    -- 2. Clear Performance Metrics & Success Memory
    DELETE FROM public.consumption_metrics WHERE tenant_id = v_tenant_id;
    DELETE FROM public.agent_success_memory WHERE tenant_id = v_tenant_id;
    DELETE FROM public.evaluations WHERE tenant_id = v_tenant_id;

    -- 3. Clear System, Integration, and Audit Logs
    DELETE FROM public.audit_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.integration_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.system_logs WHERE tenant_id = v_tenant_id;

    -- 4. Clear Security Data
    DELETE FROM public.incidents WHERE tenant_id = v_tenant_id;

    -- 5. Clear Conversations & Message History
    DELETE FROM public.conversation_artifacts WHERE tenant_id = v_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = v_tenant_id;
    DELETE FROM public.conversations WHERE tenant_id = v_tenant_id;

    -- 6. Clear Contacts Base
    DELETE FROM public.contacts WHERE tenant_id = v_tenant_id;
    
    -- 7. Clear Campaign Registry (Master list in screenshot)
    DELETE FROM public.campaigns WHERE tenant_id = v_tenant_id;
    
    -- 8. Reset Decision Engine States
    BEGIN
        DELETE FROM public.conversation_state_engine WHERE tenant_id = v_tenant_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RAISE NOTICE 'Reset TOTAL (v1.1) complete for tenant: %', v_tenant_id;
END $$;
