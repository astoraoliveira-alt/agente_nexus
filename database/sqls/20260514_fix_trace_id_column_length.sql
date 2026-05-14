-- 20260514_fix_trace_id_column_length.sql
-- Fix: trace_id estava como varchar(255) mas JWTs têm 289+ chars.
-- O Facebook também adiciona ?fbclid= que pode tornar o trace_id ainda maior.
-- Solução: mudar para TEXT (sem limite de tamanho) nas tabelas afetadas.

-- Fix 1: messages.trace_id
ALTER TABLE public.messages
    ALTER COLUMN trace_id TYPE TEXT;

-- Fix 2: integration_logs.trace_id (evita o "Log Sync Error" secundário)
ALTER TABLE public.integration_logs
    ALTER COLUMN trace_id TYPE TEXT;

-- Fix 3: integration_logs.external_id (também pode receber JWTs longos)
ALTER TABLE public.integration_logs
    ALTER COLUMN external_id TYPE TEXT;
