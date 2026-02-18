-- =============================================
-- SECURE EMBEDDINGS SETUP
-- Purpose: Offload embedding generation to backend (Supabase Edge Function / N8N)
-- Security: Removes the need for Client-Side API Keys
-- =============================================

-- 1. Create the Function that notifies the Embedding Service
CREATE OR REPLACE FUNCTION handle_new_knowledge_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- OPTIONS FOR EMBEDDING GENERATION:
  
  -- OPTION A: Call Supabase Edge Function (Recommended)
  -- Requires `pg_net` extension enabled in Supabase Dashboard
  /*
  PERFORM net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/generate-embedding',
      headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
          'record_id', NEW.id,
          'content', NEW.content
      )
  );
  */

  -- OPTION B: Call N8N Webhook (Easiest for Low-Code)
  -- The N8N workflow will receive the content, generate embedding, and update the row.
  /*
  PERFORM net.http_post(
      url := 'https://n8n.webhook.url/generate-embedding',
      body := jsonb_build_object(
          'record_id', NEW.id,
          'content', NEW.content,
          'tenant_id', NEW.tenant_id
      )
  );
  */
  
  -- For now, we just log valid insertion. The external service (N8N/Edge) can also
  -- poll this table for rows where embedding IS NULL or use the trigger above.
  
  RETURN NEW;
END;
$$;

-- 2. Bind Trigger to Table
DROP TRIGGER IF EXISTS tr_secure_embedding_generation ON agent_knowledge;
CREATE TRIGGER tr_secure_embedding_generation
  AFTER INSERT ON agent_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_knowledge_item();

-- 3. Comment explaining the architecture
COMMENT ON FUNCTION handle_new_knowledge_item IS 'Trigger implementation to offload vector generation to a secure backend service, removing client-side API keys.';
