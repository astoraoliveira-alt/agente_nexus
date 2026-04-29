-- =============================================
-- MIGRATION: Agent Audit Logs
-- Description: Creates audit trail for agent configurations and personality changes.
-- =============================================

-- 1. Create Audit Table
CREATE TABLE IF NOT EXISTS agent_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    actor_id UUID, -- Admin who made the change (if logged in)
    actor_name TEXT, -- Human readable name for the admin
    action VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_state JSONB,
    new_state JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Audit Trigger Function
CREATE OR REPLACE FUNCTION audit_agent_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, action, old_state, new_state)
        VALUES (OLD.id, auth.uid(), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, action, old_state)
        VALUES (OLD.id, auth.uid(), 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, action, new_state)
        VALUES (NEW.id, auth.uid(), 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply Trigger to agents table
DROP TRIGGER IF EXISTS trg_audit_agents ON agents;
CREATE TRIGGER trg_audit_agents
AFTER INSERT OR UPDATE OR DELETE ON agents
FOR EACH ROW EXECUTE FUNCTION audit_agent_changes();
