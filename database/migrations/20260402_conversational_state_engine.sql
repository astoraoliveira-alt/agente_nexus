-- Migration: Conversational Decision Engine (State & Intents)
-- Arquitetura v1 - Multi-Tenant State Management

-- 1. Cria a coluna dedicada para o Estado do Contexto na tabela Conversations
-- Isso isola o "Memória do Bot" de metadados genéricos de provedores (DeviceID, etc)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS context_state JSONB DEFAULT '{}'::jsonb;

-- 2. Criação de índices JSONB para permitir buscas eficientes no Cron Job/Ghosting
-- (Exemplo: Buscar todas conversas com stage=pronto_link rapidinho)
CREATE INDEX IF NOT EXISTS idx_conversations_context_state_gin 
ON public.conversations USING GIN (context_state);

-- 3. Cria a RPC (Remote Procedure Call) para o N8N conseguir mutar o estado com segurança
-- Isso impede que o N8N precise fazer chamadas completas de PATCH que exijam bypass do RLS de toda tabela.
CREATE OR REPLACE FUNCTION public.fn_update_conversation_state(
    p_conversation_id UUID,
    p_new_state JSONB,
    p_new_stage_id UUID DEFAULT NULL,
    p_new_flow_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- O N8N deve usar a service_role key ou o user autenticado deve ter permissão no RLS
    -- O SECURITY DEFINER permite execução atômica isolada.
    UPDATE public.conversations
    SET 
        context_state = p_new_state,
        current_stage_id = COALESCE(p_new_stage_id, current_stage_id),
        current_flow_id = COALESCE(p_new_flow_id, current_flow_id)
    WHERE id = p_conversation_id;
END;
$$;

-- 4. Garante que os papéis corretos possam invocar a função (Dashboard UI e Motor N8N)
GRANT EXECUTE ON FUNCTION public.fn_update_conversation_state(UUID, JSONB, UUID, UUID) TO authenticated, service_role;

-- 5. Função de utilidade para o CRON de Inatividade (Ghosting)
-- Permite ao n8n puxar rapidamente conversas inativas baseadas no Status e Tempo
CREATE OR REPLACE FUNCTION public.fn_get_idle_conversations_for_followup(
    p_idle_minutes INT DEFAULT 10
)
RETURNS TABLE (
    conversation_id UUID,
    tenant_id UUID,
    agent_id UUID,
    current_flow_id UUID,
    current_stage_id UUID,
    context_state JSONB,
    last_message_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, c.tenant_id, c.agent_id, c.current_flow_id, c.current_stage_id, c.context_state, c.last_message_at
    FROM public.conversations c
    WHERE 
        c.status = 'ai_active' 
        AND c.last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval)
        -- Impede follow-up se um operador assumiu ou se o bot já rotulou como follow-up completo
        AND (c.context_state->'flags'->>'followup_sent') IS DISTINCT FROM 'true';
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_idle_conversations_for_followup(INT) TO authenticated, service_role;
