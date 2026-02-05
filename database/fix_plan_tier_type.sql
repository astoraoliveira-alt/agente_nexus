-- =============================================
-- Migration: Fix plan_tier column type
-- Allows storing Plan Catalog IDs instead of just Enum values
-- =============================================

-- 1. Change column type from plan_type (Enum) to TEXT
-- This is necessary because IDs like 'plan-enterprise-flex' are not in the 'plan_type' enum ('fixed', 'flex', 'unlimited')
ALTER TABLE companies ALTER COLUMN plan_tier TYPE TEXT;

-- 2. (Optional) Add a check constraint or foreign key later if strictness is needed
-- For now, this resolves the "invalid input value for enum plan_type" error.
