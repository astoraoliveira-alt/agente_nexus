-- Migration: Create reengage_batch_queue, claim_reengage_batch RPC, and schedule 16h BRT (19h UTC) pg_cron job

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.reengage_batch_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  conversation_id uuid,
  group_name text NOT NULL,
  kind text NOT NULL,
  template_id text,
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT uq_reengage_batch_phone UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_reengage_batch_queue_status
  ON public.reengage_batch_queue (status, created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_reengage_batch(p_limit int DEFAULT 400)
RETURNS SETOF public.reengage_batch_queue
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.reengage_batch_queue
  SET status = 'processing'
  WHERE id IN (
    SELECT id
    FROM public.reengage_batch_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Unschedule if already exists, then schedule for 16:00-18:59 BRT (19:00-21:59 UTC) on Nov 24
DO $$
BEGIN
  PERFORM cron.unschedule('reengage-nov-16h-job');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reengage-nov-16h-job',
  '* 19-21 24 11 *',
  $$
  SELECT net.http_post(
    url := 'https://wyfmyipbvoggusclwdhj.supabase.co/functions/v1/reengage-nov-16h',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  WHERE EXISTS (
    SELECT 1 FROM public.reengage_batch_queue WHERE status = 'pending'
  );
  $$
);
