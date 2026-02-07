-- =============================================
-- MIGRATION: Plan Audit Logs & Schema Cleanup
-- Description: Creates audit trail for plans and removes redundancy in companies.
-- =============================================

-- 1. Create Audit Table
CREATE TABLE IF NOT EXISTS plan_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    actor_id UUID, -- Admin who made the change
    action VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_state JSONB,
    new_state JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Audit Trigger Function
CREATE OR REPLACE FUNCTION audit_plan_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, action, old_state, new_state)
        VALUES (OLD.id, auth.uid(), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, action, old_state)
        VALUES (OLD.id, auth.uid(), 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO plan_audit_logs (plan_id, actor_id, action, new_state)
        VALUES (NEW.id, auth.uid(), 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply Trigger to plans table
DROP TRIGGER IF EXISTS trg_audit_plans ON plans;
CREATE TRIGGER trg_audit_plans
AFTER INSERT OR UPDATE OR DELETE ON plans
FOR EACH ROW EXECUTE FUNCTION audit_plan_changes();

-- 4. CLEANUP: Remove redundant data from companies
-- We keep 'plan_details' for non-limit settings (like stripe_id if exists), 
-- but we strip out 'limits' and 'monthly_limit_brl'.

-- Remove 'limits' key from plan_details
UPDATE companies 
SET plan_details = plan_details - 'limits' - 'monthly_limit_brl';

-- Note: We are NOT dropping the plan_details column yet to avoid breaking 
-- other potential settings, but we've removed the redundant totals.
