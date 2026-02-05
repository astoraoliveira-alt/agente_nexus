-- =============================================
-- MIGRATION: Quality Assurance (Auditor) Module
-- Description: Creates the 'evaluations' table and RPCs for the automated audit agent in N8N.
-- Compliance: Supports ISO 42001 (Continuous Monitoring)
-- =============================================

-- 1. Create Evaluations Table
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    
    -- Quantitative Metrics
    score INT NOT NULL CHECK (score BETWEEN 0 AND 100), -- 0 to 100 Quality Score
    
    -- Qualitative Analysis
    summary TEXT, -- LLM-generated summary of performance
    tags TEXT[], -- categorization tags (e.g., 'churn_risk', 'success', 'complaint')
    
    -- Detailed Scorecard (JSON)
    -- Structure example: { "empathy": 5, "resolution": 4, "compliance": 5 }
    criteria_results JSONB DEFAULT '{}'::jsonb,
    
    -- Metadata
    ai_model VARCHAR(50), -- Which model performed the audit (e.g., 'gpt-4o')
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval by Tenant and Conversation
CREATE INDEX IF NOT EXISTS idx_evaluations_tenant ON evaluations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_conversation ON evaluations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_score ON evaluations(score); -- For finding low-score conversations

-- Enable RLS
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies
-- Allow Read for Tenant Admins/Operators
CREATE POLICY "Allow tenant read access" ON evaluations
    FOR SELECT
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Allow Write (Service Role only via RPC usually, but enabling for transparency)
-- Ideally, N8N uses Service Role which bypasses RLS, but we can set strict policies if needed.

-- =============================================
-- RPC: Get Conversation Transcript
-- Description: Fetches and formats the chat history for the LLM Auditor
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
        RETURN 'WARNING: No messages found for this conversation.';
    END IF;
    
    RETURN v_transcript;
END;
$$;

-- =============================================
-- RPC: Save Evaluation (N8N Endpoint)
-- Description: Single transaction insert for the audit result
-- =============================================
CREATE OR REPLACE FUNCTION save_evaluation(
    p_conversation_id UUID,
    p_score INT,
    p_summary TEXT,
    p_tags TEXT[],
    p_criteria JSONB,
    p_model VARCHAR DEFAULT 'n8n-auto'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_agent_id UUID;
    v_eval_id UUID;
BEGIN
    -- 1. Resolve Tenant and Agent from Conversation
    SELECT tenant_id, agent_id INTO v_tenant_id, v_agent_id
    FROM conversations
    WHERE id = p_conversation_id;
    
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Conversation not found';
    END IF;

    -- 2. Insert Evaluation
    INSERT INTO evaluations (
        tenant_id,
        conversation_id,
        agent_id,
        score,
        summary,
        tags,
        criteria_results,
        ai_model
    ) VALUES (
        v_tenant_id,
        p_conversation_id,
        v_agent_id,
        p_score,
        p_summary,
        p_tags,
        p_criteria,
        p_model
    )
    RETURNING id INTO v_eval_id;
    
    -- 3. Trigger Incident if Score is Low (< 40)
    -- This is the feedback loop for ISO 42001
    IF p_score < 40 THEN
        INSERT INTO incidents (
            tenant_id,
            agent_id,
            title,
            description,
            severity,
            status,
            reported_by
        ) VALUES (
            v_tenant_id,
            v_agent_id,
            'Low Quality Interaction Detected (Score: ' || p_score || ')',
            'Automated Audit Flag: ' || p_summary || E'\n\nTags: ' || array_to_string(p_tags, ', '),
            'medium',
            'open',
            NULL -- System reported
        );
    END IF;

    -- 4. ⚡ Intelligent Lead Qualification (CRM Sync)
    DECLARE
        v_user_identifier VARCHAR;
        v_new_status VARCHAR;
    BEGIN
        SELECT user_identifier INTO v_user_identifier FROM conversations WHERE id = p_conversation_id;
        
        -- Logic: >=80 SQL, >=50 MQL, else Lead
        v_new_status := CASE 
            WHEN p_score >= 80 THEN 'sql'
            WHEN p_score >= 50 THEN 'mql'
            ELSE 'lead'
        END;

        IF v_user_identifier IS NOT NULL THEN
            UPDATE contacts
            SET lifecycle_status = v_new_status,
                tags = array_cat(COALESCE(tags, '{}'::text[]), p_tags),
                updated_at = NOW()
            WHERE identifier = v_user_identifier
              AND tenant_id = v_tenant_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Silent fail for CRM sync to avoid breaking evaluation save
        RAISE NOTICE 'Erro ao qualificar lead na auditoria: %', SQLERRM;
    END;

    RETURN jsonb_build_object('success', true, 'evaluation_id', v_eval_id);
END;
$$;

-- Grant permissions to authenticated users (and service role)
GRANT EXECUTE ON FUNCTION get_conversation_transcript(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_evaluation(UUID, INT, TEXT, TEXT[], JSONB, VARCHAR) TO authenticated, service_role;
