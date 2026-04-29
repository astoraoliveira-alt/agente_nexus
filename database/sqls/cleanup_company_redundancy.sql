-- =============================================
-- MIGRATION: Schema Cleanup
-- Description: Removes redundant JSONB keys from companies table.
-- =============================================

-- 1. Remove 'limits', 'prices', and legacy budget keys from plan_details
UPDATE companies 
SET plan_details = plan_details - 'limits' - 'prices' - 'monthly_limit_brl';

-- 2. Verify and optionally drop legacy columns if they exist as real columns
-- (Based on the schema provided, monthly_limit_brl was inside JSONB, but let's be safe)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='monthly_limit_brl') THEN
        ALTER TABLE companies DROP COLUMN monthly_limit_brl;
    END IF;
END $$;
