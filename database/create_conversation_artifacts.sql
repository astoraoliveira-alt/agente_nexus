-- =============================================
-- MIGRATION: Create conversation_artifacts table
-- Purpose:
-- 1. Store generic artifact paths (URLs or Supabase Storage paths) 
--    for audio, images, videos exchanged during conversations.
-- 2. Ensure multi-tenant security with RLS.
-- =============================================

CREATE TABLE IF NOT EXISTS public.conversation_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    message_id UUID, -- Deliberately avoiding FK to public.messages(id) to prevent unique constraint errors
    agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL, -- e.g., 'vapi', 'whatsapp', 'internal'
    file_type VARCHAR(50) NOT NULL, -- e.g., 'audio', 'image', 'video'
    storage_path VARCHAR(255),
    external_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_conv_artifacts_tenant ON public.conversation_artifacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conv_artifacts_conv ON public.conversation_artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_artifacts_agent ON public.conversation_artifacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_conv_artifacts_message ON public.conversation_artifacts(message_id);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.conversation_artifacts ENABLE ROW LEVEL SECURITY;

-- REAPPLY OPTIMIZED POLICY
DROP POLICY IF EXISTS "Tenant Access Conversation Artifacts" ON public.conversation_artifacts;

CREATE POLICY "Tenant Access Conversation Artifacts" ON public.conversation_artifacts 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_conversation_artifacts_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conv_artifacts_modtime ON public.conversation_artifacts;
CREATE TRIGGER update_conv_artifacts_modtime
BEFORE UPDATE ON public.conversation_artifacts
FOR EACH ROW
EXECUTE FUNCTION update_conversation_artifacts_modtime();
