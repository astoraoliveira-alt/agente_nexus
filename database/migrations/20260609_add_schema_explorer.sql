-- Migration: Add Schema Explorer configurations, security role and execution RPC
-- Date: 2026-06-09
-- Author: Senior Full-Stack Engineer

-- 1. Create schema_view_config table
CREATE TABLE IF NOT EXISTS public.schema_view_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            text NOT NULL DEFAULT 'Visão Principal',
  nodes           jsonb NOT NULL DEFAULT '[]'::jsonb,
  mappings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  rpc_map         jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_tables  text[] NOT NULL DEFAULT '{}'::text[],
  allowed_rpcs    text[] NOT NULL DEFAULT '{}'::text[],
  denied_columns  text[] NOT NULL DEFAULT '{}'::text[],
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.schema_view_config ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policy for multitenant isolation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'schema_view_config' AND policyname = 'tenant_rw'
  ) THEN
    CREATE POLICY "tenant_rw" ON public.schema_view_config
      FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
  END IF;
END
$$;

-- 4. Create the restricted read-only role nexus_readonly
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexus_readonly') THEN
    CREATE ROLE nexus_readonly NOLOGIN;
  END IF;
END
$$;

-- Grant permissions to nexus_readonly
GRANT USAGE ON SCHEMA public TO nexus_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO nexus_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO nexus_readonly;

-- Allow authenticated and service_role to assume the nexus_readonly role
GRANT nexus_readonly TO authenticated;
GRANT nexus_readonly TO service_role;

-- 5. Create exec_readonly_sql RPC to run queries with the restricted role
CREATE OR REPLACE FUNCTION public.exec_readonly_sql(q text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Restrict execution permissions to only SELECT by switching to nexus_readonly role
  PERFORM set_config('role', 'nexus_readonly', true);
  
  -- Force statement timeout to protect database resources (5 seconds)
  PERFORM set_config('statement_timeout', '5000', true);

  -- Execute query and capture JSON representation of the resulting dataset
  EXECUTE 'SELECT coalesce(json_agg(t), ''[]''::jsonb) FROM (' || q || ') t' INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 6. Insert default seed data for each active tenant
-- Active Tenants: Aegea, Alpargatas, Davos, Edenred
-- This populates default nodes layout, mappings and RPC configurations so the feature is loaded immediately.
INSERT INTO public.schema_view_config (
  tenant_id, 
  name, 
  nodes, 
  mappings, 
  rpc_map, 
  allowed_tables, 
  allowed_rpcs, 
  denied_columns
)
SELECT 
  c.id as tenant_id,
  'Visão Principal' as name,
  '[
    {"table": "agents", "x": 300, "y": 16},
    {"table": "contacts", "x": 600, "y": 28},
    {"table": "campaigns", "x": 26, "y": 250},
    {"table": "conversations", "x": 300, "y": 300},
    {"table": "messages", "x": 600, "y": 300}
  ]'::jsonb as nodes,
  '{
    "agents": {
      "label": "Agentes de IA",
      "columns": {
        "id": "Identificador",
        "name": "Nome do agente",
        "status": "Situação",
        "type": "Tipo de canal",
        "risk_level": "Nível de risco",
        "tenant_id": "Empresa"
      }
    },
    "campaigns": {
      "label": "Campanhas",
      "columns": {
        "id": "Identificador",
        "name": "Nome da campanha",
        "status": "Situação",
        "total_contacts": "Total de contatos",
        "sent_count": "Enviadas",
        "conversion_count": "Conversões",
        "agent_id": "Agente responsável"
      }
    },
    "conversations": {
      "label": "Conversas",
      "columns": {
        "id": "Identificador",
        "user_name": "Cliente",
        "channel": "Canal",
        "status": "Situação",
        "last_message_at": "Última mensagem",
        "agent_id": "Agente"
      }
    },
    "messages": {
      "label": "Mensagens",
      "columns": {
        "id": "Identificador",
        "content": "Conteúdo",
        "sender_type": "Remetente",
        "message_type": "Tipo",
        "created_at": "Enviada em",
        "conversation_id": "Conversa"
      }
    },
    "contacts": {
      "label": "Contatos",
      "columns": {
        "id": "Identificador",
        "name": "Nome",
        "phone": "Telefone",
        "tenant_id": "Empresa"
      }
    }
  }'::jsonb as mappings,
  '{
    "evaluate_conversation_security": {
      "label": "Avaliação de Segurança",
      "tables": ["agents"],
      "columns": { "agents": ["id", "name", "risk_level"] }
    },
    "get_all_campaigns_metrics_v2": {
      "label": "Métricas de Campanha",
      "tables": ["campaigns"],
      "columns": { "campaigns": ["sent_count", "conversion_count"] }
    },
    "get_conversation_establishments": {
      "label": "Estabelecimentos da Conversa",
      "tables": ["conversations"],
      "columns": { "conversations": ["id", "channel", "status"] }
    },
    "fn_fetch_next_inbound_message": {
      "label": "Próxima Mensagem Inbound",
      "tables": ["messages"],
      "columns": { "messages": ["id", "content", "sender_type"] }
    }
  }'::jsonb as rpc_map,
  ARRAY['agents', 'campaigns', 'conversations', 'messages', 'contacts', 'companies']::text[] as allowed_tables,
  ARRAY['evaluate_conversation_security', 'get_all_campaigns_metrics_v2', 'get_conversation_establishments', 'fn_fetch_next_inbound_message']::text[] as allowed_rpcs,
  ARRAY['agents.meta_api_token', 'agents.zenvia_api_token', 'companies.api_key']::text[] as denied_columns
FROM public.companies c
ON CONFLICT DO NOTHING;
