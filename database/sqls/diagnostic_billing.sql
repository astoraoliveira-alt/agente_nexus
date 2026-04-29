SELECT 
    c.name as company_name,
    c.plan_tier,
    c.plan_prices->>'whatsappOfficialBillingMode' as mode_camel,
    c.plan_prices->>'whatsapp_official_billing_mode' as mode_snake,
    p.whatsapp_official_billing_mode as plan_mode
FROM companies c
LEFT JOIN plans p ON p.id = c.plan_tier
LIMIT 1;

SELECT 
    contact_phone, 
    window_started_at, 
    status,
    metadata->>'backfill_source' as source
FROM whatsapp_billing_windows
ORDER BY window_started_at DESC
LIMIT 5;

SELECT 
    direction, 
    COUNT(*) 
FROM messages 
WHERE created_at >= date_trunc('day', NOW())
GROUP BY direction;
