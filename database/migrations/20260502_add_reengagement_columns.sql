-- Migration: Add Re-engagement support to Campaigns and Outbound Queue
-- Version: [V62.0]

-- 1. Add columns to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS reengagement_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reengagement_wait_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS reengagement_max_attempts INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS reengagement_message TEXT;

-- 2. Add columns to outbound_queue table
ALTER TABLE public.outbound_queue
ADD COLUMN IF NOT EXISTS reengagement_attempt_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reengagement_last_sent_at TIMESTAMPTZ;

-- 3. Update view or RPCs if necessary (optional for now, as UI will handle metadata)

COMMENT ON COLUMN public.campaigns.reengagement_enabled IS 'Indica se o reengajamento automático está ativo para a campanha';
COMMENT ON COLUMN public.campaigns.reengagement_wait_hours IS 'Horas de espera após a última interação/envio para disparar reengajamento';
COMMENT ON COLUMN public.campaigns.reengagement_max_attempts IS 'Número máximo de tentativas de reengajamento por contato';
COMMENT ON COLUMN public.campaigns.reengagement_message IS 'Mensagem personalizada para o reengajamento';

COMMENT ON COLUMN public.outbound_queue.reengagement_attempt_count IS 'Contador de quantas vezes o reengajamento foi disparado para este lead';
COMMENT ON COLUMN public.outbound_queue.reengagement_last_sent_at IS 'Data/hora do último disparo de reengajamento';
