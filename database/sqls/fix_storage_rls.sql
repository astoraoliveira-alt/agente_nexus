-- Simplified Fix for Storage RLS in 'incident-attachments' bucket
-- These policies work even if you don't own the 'objects' table

-- 1. Policy to allow uploads (INSERT) for authenticated users in our specific bucket
DROP POLICY IF EXISTS "Allow Authenticated Uploads to Incident Attachments" ON storage.objects;
CREATE POLICY "Allow Authenticated Uploads to Incident Attachments" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'incident-attachments');

-- 2. Policy to allow reading (SELECT) for everyone (public) or authenticated users
DROP POLICY IF EXISTS "Allow Public Read Access to Incident Attachments" ON storage.objects;
CREATE POLICY "Allow Public Read Access to Incident Attachments" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'incident-attachments');

-- 3. Policy to allow authenticated users to view their own or all attachments in that bucket
DROP POLICY IF EXISTS "Allow Authenticated Read Access to Incident Attachments" ON storage.objects;
CREATE POLICY "Allow Authenticated Read Access to Incident Attachments" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'incident-attachments');
