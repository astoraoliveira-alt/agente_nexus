-- =============================================
-- FIX: Audit Log Relationships
-- Description: Adds missing foreign keys to enable PostgREST joins.
-- =============================================

-- 1. Fix agent_audit_logs
ALTER TABLE agent_audit_logs
DROP CONSTRAINT IF EXISTS fk_agent_audit_actor;

ALTER TABLE agent_audit_logs
ADD CONSTRAINT fk_agent_audit_actor
FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. Fix plan_audit_logs
-- First ensure actor_id is definitely a UUID if it isn't already (though it should be)
ALTER TABLE plan_audit_logs
DROP CONSTRAINT IF EXISTS fk_plan_audit_actor;

ALTER TABLE plan_audit_logs
ADD CONSTRAINT fk_plan_audit_actor
FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
