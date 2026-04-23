-- 1. Remove broad list-all SELECT policies on storage.objects for public buckets.
-- Public buckets still serve files through their public URLs (CDN), so getPublicUrl keeps working.
DROP POLICY IF EXISTS "Avatars readable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Chat attachments readable by authenticated" ON storage.objects;

-- 2. Add leader_only flag to chat channels
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS leader_only boolean NOT NULL DEFAULT false;

-- 3. Seed leaders channel
INSERT INTO public.chat_channels (name, description, leader_only)
SELECT 'leaders', 'Private space for leaders and admins', true
WHERE NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE name = 'leaders');

-- 4. Replace channel SELECT policy to enforce leader_only
DROP POLICY IF EXISTS "Authenticated can view channels" ON public.chat_channels;
CREATE POLICY "Members view permitted channels" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (
    leader_only = false
    OR has_role(auth.uid(), 'leader'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 5. Replace chat_messages SELECT policy to enforce channel access
DROP POLICY IF EXISTS "Authenticated can view messages" ON public.chat_messages;
CREATE POLICY "Members view messages in permitted channels" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
        AND (
          c.leader_only = false
          OR has_role(auth.uid(), 'leader'::app_role)
          OR has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

-- 6. Tighten chat_messages INSERT to also require channel access
DROP POLICY IF EXISTS "Users can post own messages" ON public.chat_messages;
CREATE POLICY "Members post in permitted channels" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
        AND (
          c.leader_only = false
          OR has_role(auth.uid(), 'leader'::app_role)
          OR has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

-- 7. Update notify_chat_message to only notify members allowed in the channel
CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ch_name text;
  ch_leader_only boolean;
  author_name text;
BEGIN
  SELECT name, leader_only INTO ch_name, ch_leader_only FROM public.chat_channels WHERE id = NEW.channel_id;
  SELECT COALESCE(NULLIF(full_name, ''), email, 'A member')
    INTO author_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
  SELECT
    p.id,
    'chat_message',
    author_name || ' in #' || COALESCE(ch_name, 'channel'),
    LEFT(COALESCE(NEW.body, CASE WHEN NEW.attachment_url IS NOT NULL THEN '📎 sent an attachment' ELSE '' END), 140),
    '/chat',
    jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id)
  FROM public.profiles p
  WHERE p.id <> NEW.user_id
    AND (
      ch_leader_only = false
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('leader','admin'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_mentions cm
      WHERE cm.message_id = NEW.id AND cm.mentioned_user_id = p.id
    );
  RETURN NEW;
END;
$$;