-- =============================================
-- FIX: get_conversation_transcript (Order and JSON Cleansing)
-- Description: Ensures messages are sorted by created_at AND external_order
-- to prevent scrambled transcripts when messages are inserted in batches (VAPI).
-- =============================================

CREATE OR REPLACE FUNCTION get_conversation_transcript(p_conversation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transcript TEXT := '';
    r RECORD;
    v_exists BOOLEAN;
    v_clean_content TEXT;
BEGIN
    -- 0. Null Safety on Input
    IF p_conversation_id IS NULL THEN
        RETURN 'ERROR: Conversation ID is NULL';
    END IF;

    -- 1. Check if conversation exists
    SELECT EXISTS(SELECT 1 FROM conversations WHERE id = p_conversation_id) INTO v_exists;
    
    IF NOT v_exists THEN
        RETURN format('ERROR: Conversation ID %s not found in database.', p_conversation_id);
    END IF;

    -- 2. Build Transcript
    -- We use created_at ASC and external_order ASC to ensure strict chronological order
    FOR r IN 
        SELECT 
            created_at,
            sender_type,
            COALESCE(content, '[MEDIA/AUDIO]') as content,
            external_order
        FROM messages 
        WHERE conversation_id = p_conversation_id 
        ORDER BY created_at ASC, COALESCE(external_order, 0) ASC
    LOOP
        -- Clean the content (remove JSON artifacts if helper exists)
        BEGIN
            v_clean_content := public.clean_message_content(r.content);
        EXCEPTION WHEN OTHERS THEN
            v_clean_content := r.content;
        END;
    
        v_transcript := v_transcript || 
                        '[' || COALESCE(to_char(r.created_at, 'DD/MM HH24:MI'), '??:??') || '] ' || 
                        UPPER(COALESCE(r.sender_type, 'UNKNOWN')) || ': ' || 
                        COALESCE(v_clean_content, '') || E'\n';
    END LOOP;
    
    -- 3. Handle Empty Transcript
    IF v_transcript IS NULL OR v_transcript = '' THEN
        RETURN 'WARNING: Transcript is empty (0 messages found).';
    END IF;
    
    RETURN v_transcript;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversation_transcript(UUID) TO postgres, anon, authenticated, service_role;
