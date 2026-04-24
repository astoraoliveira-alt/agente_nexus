-- DAVOS NEXUS - Migration: message_status_history (SAFE VERSION)
-- Descrição: Tabela para histórico detalhado de entrega de mensagens (Zenvia, Meta, etc.)
-- NOTA: Não utiliza Foreign Key para a tabela messages para evitar alteração em sua estrutura.

CREATE TABLE IF NOT EXISTS public.message_status_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id uuid NOT NULL, -- UUID da mensagem original (sem constraint de integridade direta)
    status text NOT NULL,
    description text,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Índices para performance de busca no Dashboard e Detalhes da Mensagem
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
