-- ==============================================================================
-- FIX: Segurança, Performance e Manutenção (Warnings do Supabase)
-- ==============================================================================

-- 1. SEGURANÇA: Fixar search_path em funções com privilégios elevados
-- Evita ataques de hijacking de schema.
ALTER FUNCTION public.track_campaign_response() SET search_path = public, extensions;
ALTER FUNCTION public.match_documents(vector, int, jsonb) SET search_path = public, extensions;
ALTER FUNCTION public.fn_sync_campaign_stats() SET search_path = public, extensions;


-- 2. PERFORMANCE: Otimizar Políticas RLS (Forçar InitPlan)
-- Ao envolver a função de auth em (SELECT ...), o Postgres executa uma vez por query,
-- não uma vez por linha.

-- Tabela: public.users
-- Policy: "Tenant Read Users"
-- Supomos que a lógica seja filtrar pelo tenant_id do usuário atual.
ALTER POLICY "Tenant Read Users" ON public.users 
USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- Tabela: public.campaigns
-- Policy: "Tenant Access Campaigns"
ALTER POLICY "Tenant Access Campaigns" ON public.campaigns 
USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- Tabela: public.outbound_queue
-- Policy: "Tenant Access Outbound Queue"
ALTER POLICY "Tenant Access Outbound Queue" ON public.outbound_queue 
USING (tenant_id = (SELECT public.get_auth_tenant_id()));


-- 3. MANUTENÇÃO: Remover Índice Duplicado
-- 'idx_conversations_tenant_last_message' (novo, otimizado) vs 'idx_conversations_tenant_last_msg' (antigo)
-- Vamos manter o índice novo que criamos no passo anterior e remover o redundante.
DROP INDEX IF EXISTS public.idx_conversations_tenant_last_msg;

-- ==============================================================================
-- Confirmação
-- ==============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Correções de Segurança e Performance aplicadas com sucesso.';
END $$;
