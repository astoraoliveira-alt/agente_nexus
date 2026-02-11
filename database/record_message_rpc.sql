-- 1. Drop existing function to allow changing signature
DROP FUNCTION IF EXISTS record_message(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

-- 2. Re-create with Full Multimedia & Transcription Support
CREATE OR REPLACE FUNCTION record_message(
    p_conversation_id UUID,
    p_tenant_id UUID,
    p_content TEXT DEFAULT NULL,
    p_sender_type TEXT DEFAULT 'user', -- 'user', 'ai', 'human'
    p_sender_name TEXT DEFAULT NULL,
    p_message_type TEXT DEFAULT 'text', -- 'text', 'audio', 'image', 'video', 'document'
    p_file_url TEXT DEFAULT NULL,
    p_transcription TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_message_id UUID;
    v_audio_url TEXT := NULL;
    v_image_url TEXT := NULL;
    v_video_url TEXT := NULL;
BEGIN
    -- Map file_url based on type for specific columns
    CASE p_message_type
        WHEN 'audio' THEN v_audio_url := p_file_url;
        WHEN 'image' THEN v_image_url := p_file_url;
        WHEN 'video' THEN v_video_url := p_file_url;
        ELSE NULL;
    END CASE;

    -- 1. Insert the message
    INSERT INTO messages (
        conversation_id,
        tenant_id,
        content,
        sender_type,
        sender_name,
        message_type,
        audio_url,
        image_url,
        transcription,
        metadata
    )
    VALUES (
        p_conversation_id,
        p_tenant_id,
        p_content,
        p_sender_type,
        p_sender_name,
        p_message_type,
        v_audio_url,
        v_image_url,
        p_transcription,
        p_metadata || jsonb_build_object('video_url', v_video_url)
    )
    RETURNING id INTO v_message_id;

    -- 2. Update conversation activity
    UPDATE conversations
    SET last_message_at = NOW()
    WHERE id = p_conversation_id;

    RETURN jsonb_build_object(
        'id', v_message_id, 
        'conversation_id', p_conversation_id, 
        'status', 'success'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION record_message(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION record_message(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
