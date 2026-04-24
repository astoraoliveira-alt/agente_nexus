-- 1. Garante que a tabela messages tenha uma Primary Key (necessário para a FK abaixo)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.messages'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE public.messages ADD PRIMARY KEY (id);
    END IF;
END $$;

-- 2. Criação da tabela de histórico de status
CREATE TABLE IF NOT EXISTS public.message_status_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
    status text NOT NULL,
    description text,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_msh_message_id ON public.message_status_history(message_id);
CREATE INDEX IF NOT EXISTS idx_msh_created_at ON public.message_status_history(created_at);

-- Permissões
ALTER TABLE public.message_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.message_status_history
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for service_role" ON public.message_status_history
    FOR ALL USING (true);

GRANT ALL ON public.message_status_history TO postgres;
GRANT ALL ON public.message_status_history TO service_role;
GRANT ALL ON public.message_status_history TO authenticated;
