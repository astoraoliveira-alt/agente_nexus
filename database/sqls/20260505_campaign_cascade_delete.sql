-- MIGRATION: Refinar Exclusão de Campanhas (Cascade & Cleanup)
-- Garante que Leads, Logs e Filas sejam apagados quando a campanha for removida.
-- Preserva Conversas e Mensagens conforme solicitado.

BEGIN;

-- 1. AGENT_LEADS
ALTER TABLE public.agent_leads DROP CONSTRAINT IF EXISTS agent_leads_campaign_id_fkey;
ALTER TABLE public.agent_leads 
ADD CONSTRAINT agent_leads_campaign_id_fkey 
FOREIGN KEY (campaign_id) 
REFERENCES campaigns(id) 
ON DELETE CASCADE;

-- 2. INTEGRATION_LOGS
ALTER TABLE public.integration_logs DROP CONSTRAINT IF EXISTS integration_logs_campaign_id_fkey;
ALTER TABLE public.integration_logs 
ADD CONSTRAINT integration_logs_campaign_id_fkey 
FOREIGN KEY (campaign_id) 
REFERENCES campaigns(id) 
ON DELETE CASCADE;

-- 3. CONVERSATIONS
-- Garante que o vínculo seja quebrado mas a conversa MANTIDA (SET NULL)
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_campaign_id_fkey;
ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_campaign_id_fkey 
FOREIGN KEY (campaign_id) 
REFERENCES campaigns(id) 
ON DELETE SET NULL;

-- 4. TRIGGER PARA LIMPEZA DE DADOS VINCULADOS (INBOUND QUEUE)
-- Como inbound_queue não tem campaign_id direto, usamos um trigger para limpar via conversation_id
CREATE OR REPLACE FUNCTION public.fn_cleanup_campaign_related_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Limpar fila de entrada vinculada às conversas desta campanha
    DELETE FROM public.inbound_queue 
    WHERE conversation_id IN (
        SELECT id FROM public.conversations WHERE campaign_id = OLD.id
    );
    
    DELETE FROM public.inbound_queue_errors 
    WHERE conversation_id IN (
        SELECT id FROM public.conversations WHERE campaign_id = OLD.id
    );

    -- Nota: Conversations permanecem pois o FK acima é SET NULL
    -- Mensagens permanecem pois são CASCADE de Conversations
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_campaign_related_data ON public.campaigns;
CREATE TRIGGER trg_cleanup_campaign_related_data
BEFORE DELETE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.fn_cleanup_campaign_related_data();

-- 5. GARANTIA DE CASCADE NAS OUTRAS TABELAS (Caso ainda não estejam)
ALTER TABLE public.outbound_queue DROP CONSTRAINT IF EXISTS outbound_queue_campaign_id_fkey;
ALTER TABLE public.outbound_queue ADD CONSTRAINT outbound_queue_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_import_logs DROP CONSTRAINT IF EXISTS campaign_import_logs_campaign_id_fkey;
ALTER TABLE public.campaign_import_logs ADD CONSTRAINT campaign_import_logs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

COMMIT;
