-- Knowledge Base (RAG) Schema
-- Relationship: N files = 1 agent

CREATE TABLE IF NOT EXISTS agent_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT, -- Extracted text for RAG
    file_url VARCHAR(1024), -- Storage link
    file_type VARCHAR(50), -- pdf, txt, etc
    file_size INTEGER, -- in bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies might need adjustment if Super Admins need cross-tenant access, 
-- but following the current pattern of the project.
CREATE POLICY "Users can view knowledge for their tenant"
    ON agent_knowledge FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage knowledge for their tenant"
    ON agent_knowledge FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_tenant ON agent_knowledge(tenant_id);
