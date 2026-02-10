-- Migration: Add evolution_instance to agents table for dynamic lookup
-- Objective: Allow n8n to identify tenant_id and agent_id from WhatsApp instance name

ALTER TABLE agents
ADD COLUMN IF NOT EXISTS evolution_instance VARCHAR(255);

-- Add unique index for high-performance lookup
-- Ensures one instance name maps to exactly one agent
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_evolution_instance 
ON agents (evolution_instance) 
WHERE evolution_instance IS NOT NULL;

-- Log the migration
COMMENT ON COLUMN agents.evolution_instance IS 'Nome da instância na Evolution API para mapeamento dinâmico no n8n';
