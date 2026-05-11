-- Migração: Frequency Capping System (Governança Enterprise)
-- Objetivo: Evitar múltiplos disparos de campanhas para o mesmo lead em curto intervalo.

-- 1. Tabela de Logs de Pressão de Contato
CREATE TABLE IF NOT EXISTS public.contact_pressure_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_phone VARCHAR(255) NOT NULL,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    trace_id VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para busca rápida no dispatcher
CREATE INDEX IF NOT EXISTS idx_contact_pressure_phone_date 
ON public.contact_pressure_logs (contact_phone, sent_at DESC);

-- 2. Função de Check de Pressão (utilizada no Dispatcher)
CREATE OR REPLACE FUNCTION public.check_contact_pressure(
    p_tenant_id UUID,
    p_phone VARCHAR,
    p_hours_interval INT DEFAULT 24
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_sent TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT sent_at INTO v_last_sent
    FROM public.contact_pressure_logs
    WHERE tenant_id = p_tenant_id AND contact_phone = p_phone
    ORDER BY sent_at DESC
    LIMIT 1;

    -- Se nunca enviado ou passou do intervalo, TRUE (Pode enviar)
    IF v_last_sent IS NULL OR v_last_sent < (NOW() - (p_hours_interval || ' hours')::INTERVAL) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;
