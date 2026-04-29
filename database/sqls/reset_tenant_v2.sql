-- RESET TENANT DATA SCRIPT (V2.6 - ELITE FINAL CLEAN)
-- File: database/reset_tenant_v2.sql
-- Description: Final clean - Removed legacy "leads" table reference.
-- Preserves: Agents, Knowledge, Flows, Tools, and Companies.

DO $$ 
DECLARE 
    v_tenant_id UUID := 'd290f1ee-6c54-4b01-90e6-d701748f0851'; -- <--- ALVO DO RESET
BEGIN
    -- 0. Ajuste de Identidade (Realtime Safety)
    EXECUTE 'ALTER TABLE public.messages REPLICA IDENTITY FULL';
    EXECUTE 'ALTER TABLE public.conversations REPLICA IDENTITY FULL';

    -- 1. LIMPEZA DE LOGS E DEPENDÊNCIAS EXTERNAS (PRIORIDADE ALTA)
    DELETE FROM public.integration_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.audit_logs WHERE tenant_id = v_tenant_id;
    
    -- Security Logs (via conversation_id)
    DELETE FROM public.security_logs 
    WHERE conversation_id IN (SELECT id FROM public.conversations WHERE tenant_id = v_tenant_id);

    DELETE FROM public.decision_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.system_logs WHERE tenant_id = v_tenant_id;
    DELETE FROM public.incidents WHERE tenant_id = v_tenant_id;
    DELETE FROM public.campaign_import_logs WHERE tenant_id = v_tenant_id;
    
    DELETE FROM public.agent_audit_logs 
    WHERE agent_id IN (SELECT id FROM public.agents WHERE tenant_id = v_tenant_id);

    -- 2. LIMPEZA DE FILAS 
    DELETE FROM public.inbound_queue WHERE tenant_id = v_tenant_id;
    DELETE FROM public.inbound_queue_errors WHERE tenant_id = v_tenant_id;
    DELETE FROM public.agent_responses_queue WHERE tenant_id = v_tenant_id;
    DELETE FROM public.outbound_queue WHERE tenant_id = v_tenant_id;

    -- 3. LIMPEZA DE MEMÓRIA E SESSÕES (Smart Subqueries)
    DELETE FROM public.chat_histories_memory 
    WHERE session_id::text IN (SELECT id::text FROM public.conversations WHERE tenant_id = v_tenant_id);

    DELETE FROM public.conversation_security_sessions 
    WHERE conversation_id IN (SELECT id FROM public.conversations WHERE tenant_id = v_tenant_id);

    DELETE FROM public.agent_success_memory WHERE tenant_id = v_tenant_id;
    DELETE FROM public.conversation_artifacts WHERE tenant_id = v_tenant_id;

    -- 4. LIMPEZA DE MENSAGENS E CONVERSAS
    -- Usando SQL dinâmico para evitar erro se a tabela não existir
    BEGIN
        EXECUTE 'DELETE FROM public.message_status_history WHERE message_id IN (SELECT id FROM public.messages WHERE tenant_id = ' || quote_literal(v_tenant_id) || ')';
    EXCEPTION WHEN undefined_table THEN 
        RAISE NOTICE 'Tabela message_status_history ignorada (ainda não existe).';
    END;

    DELETE FROM public.messages WHERE tenant_id = v_tenant_id;
    DELETE FROM public.conversations WHERE tenant_id = v_tenant_id;

    -- 5. LIMPEZA DE CAMPANHAS E LEADS
    DELETE FROM public.agent_leads WHERE tenant_id = v_tenant_id;
    DELETE FROM public.campaigns WHERE tenant_id = v_tenant_id;

    -- 6. FINANCEIRO E BASE DE CONTATOS
    DELETE FROM public.consumption_metrics WHERE tenant_id = v_tenant_id;
    DELETE FROM public.contact_conversions WHERE tenant_id = v_tenant_id;
    DELETE FROM public.whatsapp_billing_windows WHERE tenant_id = v_tenant_id;
    DELETE FROM public.billing_alerts WHERE tenant_id = v_tenant_id;
    DELETE FROM public.contacts WHERE tenant_id = v_tenant_id;

    RAISE NOTICE 'Nexus Elite Reset (V2.6) concluído com sucesso para o Tenant: %', v_tenant_id;
END $$;
