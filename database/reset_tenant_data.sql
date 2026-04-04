-- Reset Total: Davos Nexus (Tenant Edenred)
-- Limpa filas e históricos para novo teste V50.15

DO $$ 
DECLARE 
    v_tenant_id UUID := 'd290f1ee-6c54-4b01-90e6-d701748f0851';
BEGIN
    -- 1. Limpar Fila de Entrada (Inbound)
    DELETE FROM public.inbound_queue WHERE tenant_id = v_tenant_id;

    -- 2. Limpar Fila de Saída (Outbound)
    DELETE FROM public.outbound_queue WHERE tenant_id = v_tenant_id;

    -- 3. Limpar Mensagens (Histórico da Lia)
    DELETE FROM public.messages WHERE tenant_id = v_tenant_id;

    -- 4. Limpar Conversas
    DELETE FROM public.conversations WHERE tenant_id = v_tenant_id;

    -- 5. Limpar Contatos (Desta Tenant)
    DELETE FROM public.contacts WHERE tenant_id = v_tenant_id;

    RAISE NOTICE 'Dashboard Davos Nexus LIMPO para o Tenant Edenred!';
END $$;
