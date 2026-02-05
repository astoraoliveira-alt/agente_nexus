-- Create Contacts Table for CRM
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    identifier VARCHAR(255) NOT NULL UNIQUE, -- Phone (WhatsApp) or Email
    email VARCHAR(255),
    phone VARCHAR(255),
    avatar_url VARCHAR(1024),
    
    -- Categorization
    tags TEXT[] DEFAULT '{}',
    
    -- Metadata (N8N context, etc)
    extra_info JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_identifier ON contacts(identifier);

-- Update RLS (Policies)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Note: In production, use strict "auth.uid()". 
-- For this setup where we simulate usage or use service roles:
DROP POLICY IF EXISTS "Users can view contacts of their tenant" ON contacts;
CREATE POLICY "Users can view contacts of their tenant"
    ON contacts FOR SELECT
    USING (true); -- Simplified for Development/Demo

DROP POLICY IF EXISTS "Users can insert/update contacts of their tenant" ON contacts;
CREATE POLICY "Users can insert/update contacts of their tenant"
    ON contacts FOR ALL
    USING (true); -- Simplified for Development/Demo
