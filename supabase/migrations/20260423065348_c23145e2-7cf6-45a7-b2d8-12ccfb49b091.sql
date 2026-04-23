-- 1. Threaded replies
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON public.chat_messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created ON public.chat_messages(channel_id, created_at DESC);

-- 2. Reactions
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view reactions" ON public.chat_reactions;
DROP POLICY IF EXISTS "Users can add own reactions" ON public.chat_reactions;
DROP POLICY IF EXISTS "Users can remove own reactions" ON public.chat_reactions;
CREATE POLICY "Authenticated can view reactions" ON public.chat_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can add own reactions" ON public.chat_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions" ON public.chat_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Mentions
CREATE TABLE IF NOT EXISTS public.chat_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, mentioned_user_id)
);
ALTER TABLE public.chat_mentions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_chat_mentions_user ON public.chat_mentions(mentioned_user_id);

DROP POLICY IF EXISTS "Authenticated can view mentions" ON public.chat_mentions;
DROP POLICY IF EXISTS "Message authors can insert mentions" ON public.chat_mentions;
CREATE POLICY "Authenticated can view mentions" ON public.chat_mentions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Message authors can insert mentions" ON public.chat_mentions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND m.user_id = auth.uid())
);

-- 4. Read state
CREATE TABLE IF NOT EXISTS public.chat_reads (
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own reads" ON public.chat_reads;
DROP POLICY IF EXISTS "Users upsert own reads" ON public.chat_reads;
DROP POLICY IF EXISTS "Users update own reads" ON public.chat_reads;
CREATE POLICY "Users view own reads" ON public.chat_reads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users upsert own reads" ON public.chat_reads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reads" ON public.chat_reads FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 5. Mention notification trigger
CREATE OR REPLACE FUNCTION public.notify_chat_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  msg record;
  ch_name text;
  author_name text;
BEGIN
  SELECT user_id, channel_id, body INTO msg FROM public.chat_messages WHERE id = NEW.message_id;
  IF msg IS NULL OR msg.user_id = NEW.mentioned_user_id THEN RETURN NEW; END IF;

  SELECT name INTO ch_name FROM public.chat_channels WHERE id = msg.channel_id;
  SELECT COALESCE(NULLIF(full_name, ''), email, 'A member')
    INTO author_name FROM public.profiles WHERE id = msg.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
  VALUES (
    NEW.mentioned_user_id,
    'chat_mention',
    author_name || ' mentioned you in #' || COALESCE(ch_name, 'channel'),
    LEFT(COALESCE(msg.body, '@you'), 140),
    '/chat',
    jsonb_build_object('channel_id', msg.channel_id, 'message_id', NEW.message_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_mention ON public.chat_mentions;
CREATE TRIGGER trg_notify_chat_mention
AFTER INSERT ON public.chat_mentions
FOR EACH ROW EXECUTE FUNCTION public.notify_chat_mention();

-- 6. Update chat-message notification to skip mentioned users
CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ch_name text;
  author_name text;
BEGIN
  SELECT name INTO ch_name FROM public.chat_channels WHERE id = NEW.channel_id;
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
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_mentions cm
      WHERE cm.message_id = NEW.id AND cm.mentioned_user_id = p.id
    );

  RETURN NEW;
END;
$$;

-- 7. Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mentions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;