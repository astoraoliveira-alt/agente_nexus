-- Add failed_count column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'failed_count') THEN
        ALTER TABLE campaigns ADD COLUMN failed_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Update the existing trigger function to include failed_count logic
CREATE OR REPLACE FUNCTION fn_sync_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update campaign stats based on the outbound_queue changes
    IF (TG_OP = 'UPDATE' AND NEW.status != OLD.status) OR (TG_OP = 'INSERT') THEN
        -- Recalculate counts for the specific campaign
        UPDATE campaigns
        SET 
            sent_count = (SELECT count(*) FROM outbound_queue WHERE campaign_id = NEW.campaign_id AND status = 'sent'),
            failed_count = (SELECT count(*) FROM outbound_queue WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
            total_contacts = (SELECT count(*) FROM outbound_queue WHERE campaign_id = NEW.campaign_id)
        WHERE id = NEW.campaign_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Force recalculation of all campaign stats
UPDATE campaigns c
SET 
    failed_count = (
        SELECT count(*)
        FROM outbound_queue q
        WHERE q.campaign_id = c.id
        AND q.status = 'failed'
    ),
    sent_count = (
        SELECT count(*)
        FROM outbound_queue q
        WHERE q.campaign_id = c.id
        AND q.status = 'sent'
    );
