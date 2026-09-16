-- Script SQL para liberar Permissões de Upload e Leitura no Supabase Storage
-- Tabela: storage.objects
-- Bucket: chat-attachments

-- 1. Permitir leitura pública (qualquer pessoa/Zenvia pode baixar o contrato pelo link)
DROP POLICY IF EXISTS "Public Read chat-attachments" ON storage.objects;
CREATE POLICY "Public Read chat-attachments" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

-- 2. Permitir upload para usuários autenticados (operadores logados)
DROP POLICY IF EXISTS "Authenticated Insert chat-attachments" ON storage.objects;
CREATE POLICY "Authenticated Insert chat-attachments" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

-- 3. Permitir upload para perfil anon (caso a sessão não use Supabase Auth estrito)
DROP POLICY IF EXISTS "Anon Insert chat-attachments" ON storage.objects;
CREATE POLICY "Anon Insert chat-attachments" ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'chat-attachments');

-- 4. Permitir atualização/sobrescrita de arquivos
DROP POLICY IF EXISTS "Public Update chat-attachments" ON storage.objects;
CREATE POLICY "Public Update chat-attachments" ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'chat-attachments');
