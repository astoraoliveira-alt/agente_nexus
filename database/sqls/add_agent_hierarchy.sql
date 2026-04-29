-- Davos Nexus - Agent Hierarchy Migration
-- Purpose: Implement 1-level hierarchy (Parent -> Child) for Agents.
-- Scope: Within the same tenant.
-- Reflect Parent Action: Cascading delete and status sync.

-- 1. Add parent_agent_id, role, and API type columns
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS role VARCHAR(255),
ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS whatsapp_api_type VARCHAR(50) DEFAULT 'evolution' CHECK (whatsapp_api_type IN ('evolution', 'meta_official')),
ADD COLUMN IF NOT EXISTS meta_api_token TEXT;

-- 2. Add index for performance
CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);

-- 3. Trigger function to sync status from Parent to Child
CREATE OR REPLACE FUNCTION sync_child_agent_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If status is updated, propagate to children
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE agents 
        SET status = NEW.status
        WHERE parent_agent_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger
DROP TRIGGER IF EXISTS trg_sync_child_status ON agents;
CREATE TRIGGER trg_sync_child_status
AFTER UPDATE OF status ON agents
FOR EACH ROW
WHEN (NEW.parent_agent_id IS NULL) -- Only propagate from top-level agents to sub-agents
EXECUTE FUNCTION sync_child_agent_status();

-- 5. Validation Check: Ensure only 1 level depth
-- We can add a CHECK constraint or a trigger to prevent sub-agents from becoming parents
CREATE OR REPLACE FUNCTION enforce_agent_hierarchy_depth()
RETURNS TRIGGER AS $$
DECLARE
    parent_has_parent BOOLEAN;
BEGIN
    IF NEW.parent_agent_id IS NOT NULL THEN
        SELECT (parent_agent_id IS NOT NULL) INTO parent_has_parent
        FROM agents 
        WHERE id = NEW.parent_agent_id;
        
        IF parent_has_parent THEN
            RAISE EXCEPTION 'Davos Nexus supports only 1 level of agent hierarchy (Parent -> Child). Multi-level nesting is forbidden.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_agent_hierarchy_depth ON agents;
CREATE TRIGGER trg_enforce_agent_hierarchy_depth
BEFORE INSERT OR UPDATE OF parent_agent_id ON agents
FOR EACH ROW
EXECUTE FUNCTION enforce_agent_hierarchy_depth();
