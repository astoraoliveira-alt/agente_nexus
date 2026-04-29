-- =============================================
-- AUTOMATION: Vector Embeddings for Knowledge Base
-- Purpose: Automatically generate embeddings whenever a document is added.
-- Note: Requires Supabase Edge Functions or a similar service.
-- =============================================

-- 1. Create a function to trigger embedding generation
CREATE OR REPLACE FUNCTION handle_knowledge_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- We trigger an Edge Function that will:
  -- 1. Call OpenAI (or other) for the 'new.content'
  -- 2. Update the 'agent_knowledge' row with the resulting vector
  
  -- Example using Supabase Vault or HTTP call:
  -- PERFORM net.http_post(
  --   url := 'https://sua-url-supabase.co/functions/v1/generate-embedding',
  --   headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SECRET"}',
  --   body := jsonb_build_object('id', new.id, 'content', new.content)
  -- );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the Trigger
DROP TRIGGER IF EXISTS tr_generate_knowledge_embedding ON agent_knowledge;
CREATE TRIGGER tr_generate_knowledge_embedding
  AFTER INSERT ON agent_knowledge
  FOR EACH ROW
  WHEN (NEW.content IS NOT NULL)
  EXECUTE FUNCTION handle_knowledge_embedding();
