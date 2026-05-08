-- POLÍTICA DE SEGURANÇA (ROBUSTA - DOMÍNIO DAVOS)
-- Garante acesso para admins da Davos e isolamento para clientes.

-- 1. Garantir RLS Ativo
ALTER TABLE public.handoff_requests ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas
DROP POLICY IF EXISTS "ACESSO_TOTAL_TESTE" ON public.handoff_requests;
DROP POLICY IF EXISTS "Operadores podem ver pedidos do seu tenant" ON public.handoff_requests;
DROP POLICY IF EXISTS "Qualquer autenticado pode inserir pedidos" ON public.handoff_requests;
DROP POLICY IF EXISTS "Operadores podem atualizar pedidos do seu tenant" ON public.handoff_requests;

-- 3. Política de Leitura (Select)
CREATE POLICY "Operadores podem ver pedidos do seu tenant" 
ON public.handoff_requests
FOR SELECT
TO authenticated
USING (
  -- Regra 1: Qualquer e-mail da Davos tem passe livre
  auth.jwt() ->> 'email' LIKE '%@davosbr.com'
  OR
  -- Regra 2: Cruzamento com a tabela de usuários para demais admins/operadores
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE (users.provider_id = auth.uid()::text OR LOWER(users.email) = LOWER(auth.jwt() ->> 'email'))
    AND (
      users.role IN ('davos_admin', 'super_admin', 'tenant_admin')
      OR (
        LENGTH(users.tenant_id::text) = 36 
        AND users.tenant_id::uuid = handoff_requests.tenant_id
      )
    )
  )
);

-- 4. Política de Inserção
CREATE POLICY "Qualquer autenticado pode inserir pedidos" 
ON public.handoff_requests
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- 5. Política de Update
CREATE POLICY "Operadores podem atualizar pedidos do seu tenant" 
ON public.handoff_requests
FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'email' LIKE '%@davosbr.com'
  OR
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE (users.provider_id = auth.uid()::text OR LOWER(users.email) = LOWER(auth.jwt() ->> 'email'))
    AND (
      users.role IN ('davos_admin', 'super_admin', 'tenant_admin')
      OR (
        LENGTH(users.tenant_id::text) = 36 
        AND users.tenant_id::uuid = handoff_requests.tenant_id
      )
    )
  )
);
