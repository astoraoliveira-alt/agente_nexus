-- =============================================
-- Migration: Add Foreign Key and Align Plan IDs
-- This ensures the system can correctly join companies and plans
-- and migrates legacy enum values to the new Catalog IDs.
-- =============================================

-- 1. Migrate existing legacy values to new Catalog IDs FIRST
-- 'fixed', 'flex' and 'unlimited' are old enums.
-- 'plan-free', 'plan-pro', etc are the new IDs.
UPDATE companies SET plan_tier = 'plan-free' WHERE plan_tier = 'fixed';
UPDATE companies SET plan_tier = 'plan-pro' WHERE plan_tier = 'flex';
UPDATE companies SET plan_tier = 'plan-unlimited' WHERE plan_tier = 'unlimited';

-- 2. (Optional) Set a default plan for companies without one
UPDATE companies SET plan_tier = 'plan-free' WHERE plan_tier IS NULL OR plan_tier = '';

-- 3. Add Foreign Key Constraint NOW that data is aligned
-- This tells PostgreSQL that companies.plan_tier refers to plans.id
ALTER TABLE companies 
ADD CONSTRAINT companies_plan_tier_fkey 
FOREIGN KEY (plan_tier) REFERENCES plans(id);
