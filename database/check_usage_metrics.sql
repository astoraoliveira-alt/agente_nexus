-- Check consumption metrics for the specific agent
-- Agent ID from previous context: cba466b7-6fb6-459e-b335-f99de90814ea

SELECT 
    metric_type,
    COUNT(*) as record_count,
    SUM(value) as total_value,
    SUM(cost) as total_cost
FROM consumption_metrics
WHERE agent_id = 'cba466b7-6fb6-459e-b335-f99de90814ea'
GROUP BY metric_type;

-- Also check raw records to see if value is 0
SELECT * FROM consumption_metrics 
WHERE agent_id = 'cba466b7-6fb6-459e-b335-f99de90814ea'
ORDER BY recorded_at DESC
LIMIT 10;
