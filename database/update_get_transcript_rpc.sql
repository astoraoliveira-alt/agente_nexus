-- =============================================
-- UPDATE: get_conversation_transcript
-- Description: Updates only the transcript fetching logic to handle empty states and debugging.
-- Run this in Supabase SQL Editor to fix the "empty transcript" issue.
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
    -- 1. Check if conversation exists
    SELECT EXISTS(SELECT 1 FROM conversations WHERE id = p_conversation_id) INTO v_exists;
    
    IF NOT v_exists THEN
        RETURN 'ERROR: Conversation ID ' || p_conversation_id || ' not found.';
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
        v_transcript := v_transcript || 
                        '[' || to_char(r.created_at, 'DD/MM HH24:MI') || '] ' || 
                        UPPER(COALESCE(r.sender_type, 'UNKNOWN')) || ': ' || 
                        COALESCE(r.content, '') || E'\n';
    END LOOP;
    
    -- 3. Handle Empty Transcript
    IF v_transcript = '' THEN
        RETURN 'WARNING: No messages found for this conversation. (Check table: message fetch returned 0 rows)';
    END IF;
    
    RETURN v_transcript;
END;
$$;
