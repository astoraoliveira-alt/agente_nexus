-- =============================================
-- FIX: get_conversation_transcript (Null Safety & Permissions)
-- Description: Makes the function absolutely bulletproof against NULL inputs/outputs.
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
BEGIN
    -- 0. Null Safety on Input
    IF p_conversation_id IS NULL THEN
        RETURN 'ERROR: Conversation ID is NULL';
    END IF;

    -- 1. Check if conversation exists
    SELECT EXISTS(SELECT 1 FROM conversations WHERE id = p_conversation_id) INTO v_exists;
    
    IF NOT v_exists THEN
        -- Use format/concat to avoid NULL concatenation issues
        RETURN format('ERROR: Conversation ID %s not found in database.', p_conversation_id);
    END IF;

    -- 2. Build Transcript
    FOR r IN 
        SELECT 
            created_at,
            sender_type,
            COALESCE(content, '[MEDIA/AUDIO]') as content
        FROM messages 
        WHERE conversation_id = p_conversation_id 
        ORDER BY created_at ASC
    LOOP
        -- Use concat() logic or explicit COALESCE for every single field
        v_transcript := v_transcript || 
                        '[' || COALESCE(to_char(r.created_at, 'DD/MM HH24:MI'), '??:??') || '] ' || 
                        UPPER(COALESCE(r.sender_type, 'UNKNOWN')) || ': ' || 
                        COALESCE(r.content, '') || E'\n';
    END LOOP;
    
    -- 3. Handle Empty Transcript
    IF v_transcript IS NULL OR v_transcript = '' THEN
        RETURN 'WARNING: Transcript is empty (0 messages found).';
    END IF;
    
    RETURN v_transcript;
END;
$$;

-- Explicitly Re-Grant Permissions
GRANT EXECUTE ON FUNCTION get_conversation_transcript(UUID) TO postgres, anon, authenticated, service_role;
