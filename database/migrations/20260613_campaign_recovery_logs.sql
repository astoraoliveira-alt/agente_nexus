-- Migration: 20260613_campaign_recovery_logs.sql
-- Description: Creates the campaign_recovery_logs table and RPCs for the Re-engagement Hub

-- 1. Tabela de Logs de Recuperação
CREATE TABLE IF NOT EXISTS public.campaign_recovery_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    target_options JSONB NOT NULL DEFAULT '[]'::jsonb,
    records_affected INTEGER DEFAULT 0,
    snapshot_before JSONB DEFAULT '{}'::jsonb,
    snapshot_after JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER
);

-- RLS
ALTER TABLE public.campaign_recovery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant's recovery logs" ON public.campaign_recovery_logs;
CREATE POLICY "Users can view their tenant's recovery logs"
    ON public.campaign_recovery_logs FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "Users can insert their tenant's recovery logs" ON public.campaign_recovery_logs;
CREATE POLICY "Users can insert their tenant's recovery logs"
    ON public.campaign_recovery_logs FOR INSERT
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "Users can update their tenant's recovery logs" ON public.campaign_recovery_logs;
CREATE POLICY "Users can update their tenant's recovery logs"
    ON public.campaign_recovery_logs FOR UPDATE
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "Users can delete their tenant's recovery logs" ON public.campaign_recovery_logs;
CREATE POLICY "Users can delete their tenant's recovery logs"
    ON public.campaign_recovery_logs FOR DELETE
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_campaign_recovery_logs_tenant ON public.campaign_recovery_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recovery_logs_campaign ON public.campaign_recovery_logs(campaign_id);

DROP FUNCTION IF EXISTS public.execute_manual_reengagement_v2(UUID, UUID, TEXT[]);

CREATE OR REPLACE FUNCTION public.execute_manual_reengagement_v2(
    p_campaign_id UUID,
    p_tenant_id UUID,
    p_targets_str TEXT -- e.g. 'not_delivered,no_response'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
    v_snapshot_before JSONB;
    v_affected INT := 0;
    v_total_affected INT := 0;
BEGIN
    -- Tirar Snapshot
    SELECT jsonb_object_agg(status, count)
    INTO v_snapshot_before
    FROM (
        SELECT status, COUNT(*) as count
        FROM public.outbound_queue
        WHERE campaign_id = p_campaign_id AND tenant_id = p_tenant_id
        GROUP BY status
    ) sub;
    
    IF v_snapshot_before IS NULL THEN
        v_snapshot_before := '{}'::jsonb;
    END IF;

    -- Criar Log Running
    INSERT INTO public.campaign_recovery_logs (tenant_id, campaign_id, status, target_options, snapshot_before)
    VALUES (p_tenant_id, p_campaign_id, 'running', to_jsonb(string_to_array(p_targets_str, ',')), v_snapshot_before)
    RETURNING id INTO v_log_id;

    -- Update 1: Falhas (not_delivered) => Volta para pending, zera rastros
    IF 'not_delivered' = ANY(string_to_array(p_targets_str, ',')) THEN
        UPDATE public.outbound_queue
        SET 
            status = 'pending',
            sent_at = NULL,
            reengagement_last_sent_at = NULL,
            reengagement_attempt_count = 0
        WHERE campaign_id = p_campaign_id 
          AND tenant_id = p_tenant_id
          AND status = 'not_delivered';
          
        GET DIAGNOSTICS v_affected = ROW_COUNT;
        v_total_affected := v_total_affected + v_affected;
    END IF;

    -- Update 2: Sem Resposta => Zera count para motor puxar
    IF 'no_response' = ANY(string_to_array(p_targets_str, ',')) THEN
        UPDATE public.outbound_queue
        SET 
            reengagement_last_sent_at = NULL,
            reengagement_attempt_count = 0
        WHERE campaign_id = p_campaign_id 
          AND tenant_id = p_tenant_id
          AND status IN ('sent', 'delivered', 'read')
          AND response_detected = false
          AND reengagement_attempt_count >= 0;

        GET DIAGNOSTICS v_affected = ROW_COUNT;
        v_total_affected := v_total_affected + v_affected;
    END IF;

    -- Salva quantidade de registros que foram reinseridos na fila
    UPDATE public.campaign_recovery_logs
    SET records_affected = v_total_affected
    WHERE id = v_log_id;

    RETURN v_log_id;
END;
$$;

-- 3. RPC: Finalizar Reengajamento e Tirar Foto de Depois
CREATE OR REPLACE FUNCTION public.complete_manual_reengagement(
    p_log_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_snapshot_after JSONB;
    v_campaign_id UUID;
    v_tenant_id UUID;
BEGIN
    SELECT campaign_id, tenant_id INTO v_campaign_id, v_tenant_id
    FROM public.campaign_recovery_logs
    WHERE id = p_log_id;

    IF v_campaign_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Tirar Snapshot Final
    SELECT jsonb_object_agg(status, count)
    INTO v_snapshot_after
    FROM (
        SELECT status, COUNT(*) as count
        FROM public.outbound_queue
        WHERE campaign_id = v_campaign_id AND tenant_id = v_tenant_id
        GROUP BY status
    ) sub;
    
    IF v_snapshot_after IS NULL THEN
        v_snapshot_after := '{}'::jsonb;
    END IF;

    -- Finaliza o log
    UPDATE public.campaign_recovery_logs
    SET 
        status = 'completed',
        completed_at = NOW(),
        snapshot_after = v_snapshot_after,
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT
    WHERE id = p_log_id AND status = 'running';

    RETURN TRUE;
END;
$$;
NOTIFY pgrst, 'reload schema';
