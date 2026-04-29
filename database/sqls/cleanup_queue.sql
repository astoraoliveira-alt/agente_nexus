-- Limpa a fila de mensagens pendentes do Zenvia para parar as duplicatas atuais
-- Rode isso apenas UMA VEZ após atualizar o Porteiro e o RPC.

DELETE FROM public.inbound_queue 
WHERE status = 'pending' 
  AND created_at < NOW() - INTERVAL '1 minute';

RAISE NOTICE 'Fila limpa com sucesso.';
