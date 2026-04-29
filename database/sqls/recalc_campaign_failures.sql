-- Recalculate failed_count for all campaigns based on outbound_queue
UPDATE campaigns c
SET failed_count = (
    SELECT count(*)
    FROM outbound_queue q
    WHERE q.campaign_id = c.id
    AND q.status = 'failed'
);

-- Optional: Ensure sent_count is also correct
UPDATE campaigns c
SET sent_count = (
    SELECT count(*)
    FROM outbound_queue q
    WHERE q.campaign_id = c.id
    AND q.status = 'sent'
);
