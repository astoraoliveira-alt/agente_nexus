-- =============================================
-- FIX: Audit Log Resiliency (Resgate de Conflito 409)
-- Description: Makes audit triggers resilient to missing users in public.users.
-- =============================================

-- 1. Add actor_name to plan_audit_logs for parity
ALTER TABLE plan_audit_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;

-- 2. Resilient Agent Audit Trigger
CREATE OR REPLACE FUNCTION audit_agent_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_actor_name TEXT;
BEGIN
    -- Context Discovery
    -- Check if auth.uid() actually exists in our public.users table to avoid FK violation
    SELECT id, full_name INTO v_actor_id, v_actor_name 
    FROM users 
    WHERE id = auth.uid();

    -- Override with explicit context if provided (for simulated auth/imports)
    IF (TG_OP <> 'DELETE') THEN
        IF (NEW.last_actor_name IS NOT NULL) THEN
            v_actor_name := NEW.last_actor_name;
        END IF;
    END IF;

    -- Final fallback
    v_actor_name := COALESCE(v_actor_name, 'Sistema');

    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, old_state, new_state)
        VALUES (OLD.id, v_actor_id, v_actor_name, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, old_state)
        VALUES (OLD.id, v_actor_id, v_actor_name, 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO agent_audit_logs (agent_id, actor_id, actor_name, action, new_state)
        VALUES (NEW.id, v_actor_id, v_actor_name, 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Resilient Plan Audit Trigger
CREATE OR REPLACE FUNCTION audit_plan_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_actor_name TEXT;
BEGIN
    -- Check if actor exists
    SELECT id, full_name INTO v_actor_id, v_actor_name 
    FROM users 
    WHERE id = auth.uid();

    v_actor_name := COALESCE(v_actor_name, 'Sistema');

    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, actor_name, action, old_state, new_state)
        VALUES (OLD.id, v_actor_id, v_actor_name, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, action, actor_name, old_state)
        VALUES (OLD.id, v_actor_id, 'DELETE', v_actor_name, to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, actor_name, action, new_state)
        VALUES (NEW.id, v_actor_id, v_actor_name, 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
