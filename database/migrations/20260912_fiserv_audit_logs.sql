-- ============================================================
-- MIGRATION: Fiserv Full Audit Logs & Compliance Trail
-- Date: 2026-09-12
-- Target: Multi-tenant Fiserv API Audit Log (Approved, Denied & Errors)
-- ============================================================

-- 1. TABELA DEDICADA DE AUDITORIA FISERV
CREATE TABLE IF NOT EXISTS public.fiserv_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- create_lead, get_status, get_result, simulate, confirm
    registration_code TEXT, -- CNPJ (14 dígitos)
    contact_phone TEXT,
    contact_name TEXT,
    loan_request_id TEXT,
    http_status INTEGER,
    ok BOOLEAN NOT NULL DEFAULT false,
    status_fiserv TEXT, -- approved, rejected, denied, pending, formalization, etc.
    is_approved BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    request_payload JSONB, -- Payload enviado com dados de Opt-In, IP, Timestamp, Signer
    response_payload JSONB, -- Resposta bruta completa da Fiserv
    offer_data JSONB, -- Ofertas e condições comerciais aprovadas (se houver)
    warnings TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices estratégicos para consultas rápidas e relatórios de auditoria
CREATE INDEX IF NOT EXISTS idx_fiserv_audit_logs_tenant_action ON public.fiserv_audit_logs(tenant_id, action);
CREATE INDEX IF NOT EXISTS idx_fiserv_audit_logs_cnpj ON public.fiserv_audit_logs(registration_code);
CREATE INDEX IF NOT EXISTS idx_fiserv_audit_logs_loan_req ON public.fiserv_audit_logs(loan_request_id);
CREATE INDEX IF NOT EXISTS idx_fiserv_audit_logs_created_at ON public.fiserv_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiserv_audit_logs_is_approved ON public.fiserv_audit_logs(is_approved);

-- 2. POLÍTICAS DE RLS
ALTER TABLE public.fiserv_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access on fiserv_audit_logs"
    ON public.fiserv_audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated access on fiserv_audit_logs"
    ON public.fiserv_audit_logs
    FOR ALL
    TO authenticated
    USING (
        (tenant_id = public.get_auth_tenant_id()) 
        OR (public.is_super_admin())
        OR (tenant_id IS NULL)
    )
    WITH CHECK (
        (tenant_id = public.get_auth_tenant_id()) 
        OR (public.is_super_admin())
        OR (tenant_id IS NULL)
    );

-- 3. RPC DE REGISTRO SEGURO DE AUDITORIA (Invocada pelo n8n / Backend)
CREATE OR REPLACE FUNCTION public.fn_log_fiserv_audit(
    p_tenant_id UUID,
    p_action TEXT,
    p_registration_code TEXT DEFAULT NULL,
    p_contact_phone TEXT DEFAULT NULL,
    p_contact_name TEXT DEFAULT NULL,
    p_loan_request_id TEXT DEFAULT NULL,
    p_http_status INTEGER DEFAULT 200,
    p_ok BOOLEAN DEFAULT false,
    p_status_fiserv TEXT DEFAULT NULL,
    p_is_approved BOOLEAN DEFAULT false,
    p_error_message TEXT DEFAULT NULL,
    p_request_payload JSONB DEFAULT '{}'::jsonb,
    p_response_payload JSONB DEFAULT '{}'::jsonb,
    p_offer_data JSONB DEFAULT NULL,
    p_warnings TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
    v_clean_cnpj TEXT;
BEGIN
    v_clean_cnpj := regexp_replace(COALESCE(p_registration_code, ''), '\D', '', 'g');

    -- 1. Insere o log imutável de auditoria
    INSERT INTO public.fiserv_audit_logs (
        tenant_id,
        action,
        registration_code,
        contact_phone,
        contact_name,
        loan_request_id,
        http_status,
        ok,
        status_fiserv,
        is_approved,
        error_message,
        request_payload,
        response_payload,
        offer_data,
        warnings,
        created_at
    ) VALUES (
        p_tenant_id,
        p_action,
        NULLIF(v_clean_cnpj, ''),
        p_contact_phone,
        p_contact_name,
        p_loan_request_id,
        p_http_status,
        p_ok,
        p_status_fiserv,
        p_is_approved,
        p_error_message,
        p_request_payload,
        p_response_payload,
        p_offer_data,
        p_warnings,
        now()
    )
    RETURNING id INTO v_log_id;

    -- 2. Atualiza os metadados do lead correspondente em agent_leads (se existir no tenant)
    IF v_clean_cnpj IS NOT NULL AND v_clean_cnpj <> '' AND p_tenant_id IS NOT NULL THEN
        UPDATE public.agent_leads
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'fiserv_last_action', p_action,
            'fiserv_last_http_status', p_http_status,
            'fiserv_last_status', p_status_fiserv,
            'fiserv_is_approved', p_is_approved,
            'fiserv_loan_request_id', COALESCE(p_loan_request_id, metadata->>'loan_request_id', metadata->>'fiserv_loan_request_id'),
            'fiserv_denied_reason', CASE WHEN NOT p_is_approved THEN COALESCE(p_error_message, p_status_fiserv) ELSE NULL END,
            'fiserv_last_audit_id', v_log_id,
            'fiserv_last_audit_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
        WHERE tenant_id = p_tenant_id
          AND regexp_replace(COALESCE(identifier, ''), '\D', '', 'g') = v_clean_cnpj;
    END IF;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_log_fiserv_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, BOOLEAN, TEXT, JSONB, JSONB, JSONB, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_log_fiserv_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, BOOLEAN, TEXT, JSONB, JSONB, JSONB, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_log_fiserv_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, BOOLEAN, TEXT, JSONB, JSONB, JSONB, TEXT[]) TO anon;
