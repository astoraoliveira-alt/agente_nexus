-- =======================================================
-- TEST SCRIPT: Simulate a Failed Campaign Call from VAPI
-- =======================================================

DO $$
DECLARE
    -- Pointers for our mock data
    v_tenant_id UUID;
    v_agent_id UUID;
    v_campaign_id UUID;
    v_lead_id UUID;
    v_result JSONB;
    
    -- The simulated JSON payload from VAPI
    v_failed_payload JSONB;
BEGIN

    -- 1. Grab any existing tenant and agent to act as the context
    SELECT id INTO v_tenant_id FROM companies LIMIT 1;
    SELECT id INTO v_agent_id FROM agents WHERE tenant_id = v_tenant_id LIMIT 1;

    -- 2. Mock a Campaign to link to the lead
    INSERT INTO campaigns (tenant_id, agent_id, name, status)
    VALUES (v_tenant_id, v_agent_id, 'TEST CAMPAIGN', 'active')
    RETURNING id INTO v_campaign_id;

    -- 3. Create our "Lead" simulating a contact pending to be called
    INSERT INTO outbound_queue (tenant_id, agent_id, campaign_id, contact_name, contact_phone, status)
    VALUES (v_tenant_id, v_agent_id, v_campaign_id, 'Astor Teste', '+5511993434870', 'pending')
    RETURNING id INTO v_lead_id;

    RAISE NOTICE 'Created Lead % in status PENDING', v_lead_id;

    -- 4. Build a Payload where:
    --    - endedReason = "customer-ended-call"
    --    - durationSeconds = 4.04 (< 10)
    --    - metadata.leadId = v_lead_id
    v_failed_payload := jsonb_build_object(
        'message', jsonb_build_object(
            'timestamp', 1771871787307,
            'type', 'end-of-call-report',
            'endedReason', 'customer-ended-call',
            'durationSeconds', 4.04,
            'call', jsonb_build_object(
                'metadata', jsonb_build_object(
                    'leadId', v_lead_id,
                    'origem', 'n8n',
                    'campanha', 'oferta-produto-x'
                ),
                'id', '019c8bc9-b110-7112-a87f-533eed024126'
            )
        )
    );

    -- 5. Execute the Sync Function
    v_result := sync_vapi_call(
        v_tenant_id, 
        v_failed_payload, 
        '+5511993434870', 
        'Astor Teste', 
        v_agent_id
    );

    RAISE NOTICE 'Function Returned: %', v_result;

END $$;

-- 6. Show the result! We expect the status to be 'failed'
SELECT id, contact_name, status, error_message 
FROM outbound_queue 
WHERE contact_name = 'Astor Teste' 
ORDER BY created_at DESC 
LIMIT 1;

-- (Optional) Cleanup
-- DELETE FROM campaigns WHERE name = 'TEST CAMPAIGN';
-- DELETE FROM outbound_queue WHERE contact_name = 'Astor Teste';
