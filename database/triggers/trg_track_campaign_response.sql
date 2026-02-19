-- Trigger to automatically track campaign responses when a user replies
-- Logic:
-- 1. Watch for INSERT on messages
-- 2. If sender_type is 'user' (inbound)
-- 3. Find if this user is in an active campaign queue (outbound_queue) where response_detected is FALSE
-- 4. Mark response_detected = TRUE and increment campaign.response_count

CREATE OR REPLACE FUNCTION track_campaign_response()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_id UUID;
    v_campaign_id UUID;
    v_user_phone VARCHAR;
BEGIN
    -- Only process inbound user messages
    IF NEW.sender_type = 'user' THEN
        
        BEGIN
            -- Get user identifier (phone) from conversation
            SELECT user_identifier INTO v_user_phone
            FROM conversations
            WHERE id = NEW.conversation_id;

            -- Find matching active outbound queue item
            SELECT id, campaign_id INTO v_queue_id, v_campaign_id
            FROM outbound_queue
            WHERE tenant_id = NEW.tenant_id
              AND contact_phone = v_user_phone
              AND campaign_id IS NOT NULL
              AND response_detected = FALSE
              AND status = 'sent'
            ORDER BY created_at DESC
            LIMIT 1;

            -- If found, update tracking
            IF v_queue_id IS NOT NULL THEN
                
                -- 1. Mark queue item as responded
                UPDATE outbound_queue
                SET response_detected = TRUE
                WHERE id = v_queue_id;

                -- 2. Increment campaign response count
                UPDATE campaigns
                SET response_count = response_count + 1,
                    updated_at = NOW()
                WHERE id = v_campaign_id;
                
            END IF;

        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error in track_campaign_response trigger: %', SQLERRM;
        END;



    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow update
DROP TRIGGER IF EXISTS trg_track_campaign_response ON messages;

-- Create Trigger
CREATE TRIGGER trg_track_campaign_response
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION track_campaign_response();
