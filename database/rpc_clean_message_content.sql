CREATE OR REPLACE FUNCTION clean_message_content(raw_content TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    json_string TEXT;
    parsed_json JSONB;
BEGIN
    IF raw_content IS NULL THEN RETURN ''; END IF;
    
    -- Strip leading and trailing whitespace
    raw_content := trim(raw_content);
    
    -- Check if it starts with ={
    IF raw_content LIKE '={%' THEN
        json_string := substr(raw_content, 2);
    ELSIF raw_content LIKE '{%' THEN
         json_string := raw_content;
    ELSE
        RETURN raw_content;
    END IF;

    -- Try to parse and extract
    BEGIN
        parsed_json := json_string::jsonb;
        IF parsed_json ? 'content' AND parsed_json->>'content' IS NOT NULL THEN
            RETURN parsed_json->>'content';
        ELSIF parsed_json ? 'output' AND parsed_json->>'output' IS NOT NULL THEN
            RETURN parsed_json->>'output';
        ELSIF parsed_json ? 'text' AND parsed_json->>'text' IS NOT NULL THEN
            RETURN parsed_json->>'text';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If JSON parsing fails, just return the raw text
        RETURN raw_content;
    END;
    
    RETURN raw_content;
END;
$$;

-- Grant execution to authenticated users and service roles so they can use it in queries if needed
GRANT EXECUTE ON FUNCTION clean_message_content(TEXT) TO authenticated, service_role;
