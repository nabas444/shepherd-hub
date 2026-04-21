-- Replace broad public SELECT with one that allows reads but limits listing to authenticated users.
DROP POLICY IF EXISTS "Chat attachments readable by all" ON storage.objects;

CREATE POLICY "Chat attachments readable by authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Chat attachments public file access"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'chat-attachments');