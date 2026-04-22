-- Restrict broad anon SELECT (which enables listing) on public buckets.
-- Files remain accessible via their direct public URL through the storage CDN.

-- AVATARS
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;

CREATE POLICY "Avatars readable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- CHAT ATTACHMENTS — recreate authenticated-only listing (anon already has no listing policy
-- after the earlier migration; we keep the public file URL access via the storage CDN).
DROP POLICY IF EXISTS "Chat attachments public file access" ON storage.objects;