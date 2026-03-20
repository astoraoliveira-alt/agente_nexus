-- ========================================== --
-- DAVOS NEXUS - INBOUND QUEUE MIGRATION (V5) --
-- ========================================== --

-- 1. Tabela Principal de Fila
CREATE TABLE IF NOT EXISTS public.inbound_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.companies(id),
    agent_id uuid REFERENCES public.agents(id),
    conversation_id uuid REFERENCES public.conversations(id),
    
    -- Identificação e Ordem
    external_id varchar, -- RG da mensagem (WhatsApp call_id ou message_id)
    sequence_number int, -- Senha da conversa (1, 2, 3... por conversa)
    
    -- Conteúdo e Contexto
    payload jsonb NOT NULL, -- Dados brutos do Webhook
    context jsonb, -- Snapshot do Agente (Prompts, Tools, Governança)
    
    -- Estados e Controle
    status text DEFAULT 'pending', -- 'pending', 'processing', 'done', 'failed', 'dead'
    priority int DEFAULT 0,
    retry_count int DEFAULT 0,
    next_retry_at timestamp WITH TIME ZONE,
    locked_at timestamp WITH TIME ZONE,
    
    -- Datas e Métricas
    created_at timestamp WITH TIME ZONE DEFAULT now(),
    processed_at timestamp WITH TIME ZONE,
    queue_time interval,
    processing_time interval,
    error_message text,
    
    -- Evita duplicidade por mensagem na mesma empresa
    UNIQUE (tenant_id, external_id)
);

-- 2. Índices de Elite (Velocidade total para os 3 Workers)
CREATE INDEX IF NOT EXISTS idx_inbound_queue_supervisor 
ON public.inbound_queue (status, conversation_id, sequence_number, priority DESC, created_at);

-- 3. Comentários para o Leigo
COMMENT ON TABLE public.inbound_queue IS 'Caixa de entrada inteligente para mensagens de IA, garantindo ordem e resiliência.';
COMMENT ON COLUMN public.inbound_queue.external_id IS 'RG único da mensagem do WhatsApp para evitar respostas duplicadas.';
COMMENT ON COLUMN public.inbound_queue.sequence_number IS 'Garante que a resposta 1 venha antes da 2 na mesma conversa.';
COMMENT ON COLUMN public.inbound_queue.status IS 'Status do prato: pending (espera), processing (fogão), done (entregue).';

-- 4. Função RPC para Ingestão Segura (Elite)
CREATE OR REPLACE FUNCTION public.fn_enqueue_inbound_message(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_conversation_id uuid,
    p_external_id varchar,
    p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_seq int;
BEGIN
    -- 1. Calcula o próximo sequence_number para ESTA conversa (Item 2.1 Elite)
    SELECT COALESCE(MAX(sequence_number), 0) + 1 
    INTO v_next_seq
    FROM public.inbound_queue
    WHERE conversation_id = p_conversation_id;

    -- 2. Insere na fila
    INSERT INTO public.inbound_queue (
        tenant_id, 
        agent_id, 
        conversation_id, 
        external_id, 
        sequence_number, 
        payload, 
        status
    )
    VALUES (
        p_tenant_id, 
        p_agent_id, 
        p_conversation_id, 
        p_external_id, 
        v_next_seq, 
        p_payload, 
        'pending'
    )
    ON CONFLICT (tenant_id, external_id) DO NOTHING;
END;
$$;

-- ========================================== --
-- FIM DA MIGRAÇÃO                            --
-- ========================================== --
