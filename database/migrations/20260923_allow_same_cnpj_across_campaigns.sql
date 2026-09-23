-- ============================================================
-- MIGRATION: 20260923_allow_same_cnpj_across_campaigns.sql
-- Descrição: Remove a constraint restritiva global 'agent_leads_unique_tenant_identifier' 
-- para permitir que um mesmo CNPJ (ou identifier) possa existir em campanhas diferentes,
-- mantendo a garantia de unicidade por campanha através de
-- 'agent_leads_tenant_id_identifier_campaign_id_key'.
-- ============================================================

-- 1. Remove a trava restritiva legada que bloqueava o mesmo CNPJ em campanhas diferentes
ALTER TABLE public.agent_leads 
DROP CONSTRAINT IF EXISTS agent_leads_unique_tenant_identifier;

-- 2. Garante que a constraint correta por campanha existe e está ativa
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'agent_leads_tenant_id_identifier_campaign_id_key'
    ) THEN
        ALTER TABLE public.agent_leads 
        ADD CONSTRAINT agent_leads_tenant_id_identifier_campaign_id_key 
        UNIQUE (tenant_id, identifier, campaign_id);
    END IF;
END $$;
