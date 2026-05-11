-- Migração: Performance & Governance Infrastructure (V66.10)
-- Objetivo: Implementar Cache de Dashboard, Frequency Capping Config e Metadata de Sumarização.

-- 1. [CACHE] Tabela de Cache para o DashMaster
CREATE TABLE IF NOT EXISTS public.dash_cache (
    tenant_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. [CAPPING] Configuração de Frequency Capping por Campanha
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS capping_config JSONB DEFAULT '{
    "max_per_day": 1,
    "cooldown_hours": 24,
    "override_on_incidents": true
}'::jsonb;

-- 3. [SUMARIZAÇÃO] Campo de Resumo na Conversa (Sliding Window)
-- Nota: O campo metadata já existe, este comentário serve para formalizar o subcampo 'summary'.
COMMENT ON COLUMN public.conversations.metadata IS 'Metadados da conversa. Subcampo "summary" (JSONB) armazena o resumo para o Sliding Window (V66.9).';

-- 4. [CACHE] Função de Invalidação de Cache (Trigger)
CREATE OR REPLACE FUNCTION public.fn_invalidate_dash_cache()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.dash_cache WHERE tenant_id = NEW.tenant_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Invalida cache ao receber novas mensagens ou mudar status de fila
DROP TRIGGER IF EXISTS trg_invalidate_dash_on_message ON public.messages;
CREATE TRIGGER trg_invalidate_dash_on_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.fn_invalidate_dash_cache();

DROP TRIGGER IF EXISTS trg_invalidate_dash_on_queue ON public.inbound_queue;
CREATE TRIGGER trg_invalidate_dash_on_queue
AFTER UPDATE OF status ON public.inbound_queue
FOR EACH ROW EXECUTE FUNCTION public.fn_invalidate_dash_cache();
