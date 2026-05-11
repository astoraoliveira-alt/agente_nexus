-- ÍNDICE PARA RELATÓRIO DE INCIDENTES
-- Melhora performance da busca por logs de entrega
CREATE INDEX IF NOT EXISTS idx_messages_incident_id ON public.messages ((metadata->>'incident_id'));
