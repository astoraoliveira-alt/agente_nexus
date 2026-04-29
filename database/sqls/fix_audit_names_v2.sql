-- =============================================
-- FIX V2: Audit Name Capture (Self-Healing)
-- Description: Ensures name is stored at change time.
-- =============================================

-- 1. Ensure columns exist
ALTER TABLE plan_audit_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;

-- 2. Update TRG for Agents
CREATE OR REPLACE FUNCTION audit_agent_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT full_name INTO v_name FROM users WHERE id = auth.uid();
    
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, old_state, new_state)
        VALUES (OLD.id, auth.uid(), COALESCE(v_name, 'Sistema'), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, old_state)
        VALUES (OLD.id, auth.uid(), COALESCE(v_name, 'Sistema'), 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, new_state)
        VALUES (NEW.id, auth.uid(), COALESCE(v_name, 'Sistema'), 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update TRG for Plans
CREATE OR REPLACE FUNCTION audit_plan_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT full_name INTO v_name FROM users WHERE id = auth.uid();

    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, actor_name, action, old_state, new_state)
        VALUES (OLD.id, auth.uid(), COALESCE(v_name, 'Sistema'), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, actor_name, action, old_state)
        VALUES (OLD.id, auth.uid(), COALESCE(v_name, 'Sistema'), 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, actor_name, action, new_state)
        VALUES (NEW.id, auth.uid(), COALESCE(v_name, 'Sistema'), 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Backfill existing records
UPDATE agent_audit_logs a
SET actor_name = u.full_name
FROM users u
WHERE a.actor_id = u.id AND a.actor_name IS NULL;

UPDATE plan_audit_logs p
SET actor_name = u.full_name
FROM users u
WHERE p.actor_id = u.id AND p.actor_name IS NULL;
