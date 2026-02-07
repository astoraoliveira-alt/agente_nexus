-- Migration: Standardize Lifecycle Status
-- Updates legacy text statuses to standard codes (sql, mql, lead)

DO $$
BEGIN
    -- Update 'Lead Quente' -> 'sql'
    UPDATE contacts 
    SET lifecycle_status = 'sql' 
    WHERE lifecycle_status = 'Lead Quente' OR lifecycle_status = 'lead_qualificado';

    -- Update 'Interesse Médio' -> 'mql'
    UPDATE contacts 
    SET lifecycle_status = 'mql' 
    WHERE lifecycle_status = 'Interesse Médio' OR lifecycle_status = 'MQL';

    -- Update 'Interesse Baixo' / 'Lead' -> 'lead'
    UPDATE contacts 
    SET lifecycle_status = 'lead' 
    WHERE lifecycle_status = 'Interesse Baixo' OR lifecycle_status = 'Lead';

    -- Ensure future consistency by adding a check constraint (Optional but good practice)
    -- ALTER TABLE contacts ADD CONSTRAINT check_lifecycle_status CHECK (lifecycle_status IN ('lead', 'mql', 'sql', 'won', 'lost', 'churned'));
END $$;
