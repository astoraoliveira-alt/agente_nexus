-- =============================================
-- FIX V3: Actor Context Pass (Simulated Auth)
-- Description: Adds a context column to pass the human name to the trigger.
-- =============================================

-- 1. Add context column to agents table (hidden/internal use)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_actor_name TEXT;

-- 2. Update trigger to prioritize this context column
CREATE OR REPLACE FUNCTION audit_agent_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_name TEXT;
BEGIN
    -- Context Discovery Priority:
    -- 1. Explicit context passed in the NEW record (for simulated auth)
    -- 2. Real auth.uid() mapped to users table
    -- 3. Default to 'Sistema'
    
    IF (NEW.last_actor_name IS NOT NULL) THEN
        v_actor_name := NEW.last_actor_name;
    ELSE
        SELECT full_name INTO v_actor_name FROM users WHERE id = auth.uid();
    END IF;

    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, old_state, new_state)
        VALUES (OLD.id, auth.uid(), COALESCE(v_actor_name, 'Sistema'), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, old_state)
        VALUES (OLD.id, auth.uid(), COALESCE(v_actor_name, 'Sistema'), 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, new_state)
        VALUES (NEW.id, auth.uid(), COALESCE(v_actor_name, 'Sistema'), 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
