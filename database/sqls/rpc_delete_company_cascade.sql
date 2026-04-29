-- RPC: Hard Delete Company (Cascade)
-- Purpose: Permanently delete a company and ALL associated data.
-- ⚠️ DANGER: This action is irreversible.

CREATE OR REPLACE FUNCTION delete_company_cascade(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Delete Child Data (Order matters to avoid FK constraint violations if CASCADE is missing)
    -- Although many FKs might be ON DELETE CASCADE, we explicitly delete by tenant_id for performance and safety.

    -- Communication & Logs
    DELETE FROM messages WHERE tenant_id = p_tenant_id;
    DELETE FROM evaluations WHERE tenant_id = p_tenant_id; -- If exists
    DELETE FROM conversations WHERE tenant_id = p_tenant_id;
    DELETE FROM contacts WHERE tenant_id = p_tenant_id;
    
    -- Operational Data
    DELETE FROM consumption_metrics WHERE tenant_id = p_tenant_id;
    DELETE FROM incidents WHERE tenant_id = p_tenant_id;
    DELETE FROM audit_logs WHERE tenant_id = p_tenant_id;
    DELETE FROM company_davos_costs WHERE tenant_id = p_tenant_id;
    
    -- Agent & Flow Logic
    -- agent_flows is a join table, we might need to delete by join or rely on cascade from agents/flows.
    -- Let's rely on agents/flows deletion if possible, but to be sure:
    DELETE FROM agent_flows WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = p_tenant_id);
    
    DELETE FROM flow_stages WHERE flow_id IN (SELECT id FROM flows WHERE tenant_id = p_tenant_id);
    DELETE FROM flows WHERE tenant_id = p_tenant_id;
    
    DELETE FROM policies WHERE tenant_id = p_tenant_id;
    DELETE FROM agents WHERE tenant_id = p_tenant_id;
    
    -- Users (Must be deleted before company)
    DELETE FROM users WHERE tenant_id = p_tenant_id;

    -- 2. Delete the Company Root
    DELETE FROM companies WHERE id = p_tenant_id;

    RAISE NOTICE 'Deleted company % and all related data.', p_tenant_id;
END;
$$;
