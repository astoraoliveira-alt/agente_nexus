-- RESET TENANT DATA SCRIPT (V3.0 - ELITE FIX)
-- File: database/reset_tenant_v3_elite.sql
-- Description: Comprehensive reset for a specific tenant.
-- Fixes: "agent_id does not exist in audit_logs" error by using tenant_id.
-- Preserves: Agents, Knowledge, Flows, Tools, and Companies structure.

DO $$ 
DECLARE 
    v_tenant_id UUID := 'd290f1ee-6c54-4b01-90e6-d701748f0851'; -- <--- ALVO DO RESET (EDENRED)
BEGIN
    RAISE NOTICE 'Iniciando Reset Elite V3 para o Tenant: %', v_tenant_id;

    -- 0. Ajuste de Identidade (Realtime Safety para permitir deletes massivos)
    EXECUTE 'ALTER TABLE public.messages REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.conversations REPLICA IDENTITY FULL';

    -- 1. LIMPEZA DE LOGS (CORREÇÃO: audit_logs usa tenant_id, não agent_id)
    DELETE FROM public.integration_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.audit_logs WHERE tenant_id = v_tenant_id; -- <-- AQUI ESTAVA O ERRO
    DELETE FROM public.system_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.decision_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.campaign_import_logs WHERE tenant_id = v_tenant_id;
    
    -- Logs específicos de agentes (Estes SIM usam agent_id)
    DELETE FROM public.agent_audit_logs 
    WHERE agent_id IN (SELECT id FROM public.agents WHERE tenant_id = v_tenant_id);

    -- 2. LIMPEZA DE FILAS OPERACIONAIS
    DELETE FROM public.inbound_queue WHERE tenant_id = v_tenant_id;
    DELETE FROM public.inbound_queue_errors WHERE tenant_id = v_tenant_id;
    DELETE FROM public.agent_responses_queue WHERE tenant_id = v_tenant_id;
    DELETE FROM public.outbound_queue WHERE tenant_id = v_tenant_id;

    -- 3. LIMPEZA DE MENSAGENS E CONVERSAS (Histórico)
    DELETE FROM public.message_status_history 
    WHERE message_id IN (SELECT id FROM public.messages WHERE tenant_id = v_tenant_id);

    DELETE FROM public.messages WHERE tenant_id = v_tenant_id;
    
    -- Limpa memórias de sessões e artefatos
    DELETE FROM public.conversation_security_sessions 
    WHERE conversation_id IN (SELECT id FROM public.conversations WHERE tenant_id = v_tenant_id);
    
    DELETE FROM public.conversation_artifacts WHERE tenant_id = v_tenant_id;
    DELETE FROM public.chat_histories_memory 
    WHERE session_id::text IN (SELECT id::text FROM public.conversations WHERE tenant_id = v_tenant_id);

    DELETE FROM public.conversations WHERE tenant_id = v_tenant_id;

    -- 4. LIMPEZA DE SEGURANÇA E PERFORMANCE
    DELETE FROM public.incidents WHERE tenant_id = v_tenant_id;
    DELETE FROM public.agent_success_memory WHERE tenant_id = v_tenant_id;
    DELETE FROM public.evaluations WHERE tenant_id = v_tenant_id;

    -- 5. LIMPEZA DE CAMPANHAS E LEADS
    DELETE FROM public.agent_leads WHERE tenant_id = v_tenant_id;
    DELETE FROM public.campaigns WHERE tenant_id = v_tenant_id;

    -- 6. FINANCEIRO E BASE DE CONTATOS
    DELETE FROM public.consumption_metrics WHERE tenant_id = v_tenant_id;
    DELETE FROM public.whatsapp_billing_windows WHERE tenant_id = v_tenant_id;
    DELETE FROM public.billing_alerts WHERE tenant_id = v_tenant_id;
    DELETE FROM public.contacts WHERE tenant_id = v_tenant_id;

    RAISE NOTICE 'Nexus Elite Reset (V3.0) CONCLUÍDO para o Tenant: %', v_tenant_id;
END $$;
