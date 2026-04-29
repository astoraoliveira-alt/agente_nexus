-- Add monthly_fee_covers_usage column to plans table
-- Default is FALSE (Base Fee + Usage model) which seems to be the current underlying assumption or safer default
-- If the user wants the "Fee covers usage" model, they must enable it.

ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS monthly_fee_covers_usage BOOLEAN DEFAULT FALSE;

-- Update existing plans if needed (optional, keeping default for now)
-- UPDATE plans SET monthly_fee_covers_usage = FALSE;
