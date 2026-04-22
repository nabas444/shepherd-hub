-- =========================================
-- NOTIFICATIONS SYSTEM
-- =========================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,                    -- 'chat_message' | 'mentorship_note' | 'event' | 'role_change' | 'system'
  title text NOT NULL,
  body text,
  link text,                             -- in-app deep link path e.g. /chat
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Allow inserts from triggers (security definer functions). Also allow leaders/admins
-- to insert notifications targeted at others (e.g. admin announcements).
CREATE POLICY "Leaders and admins can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'leader'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =========================================
-- AUDIT LOG (role changes)
-- =========================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,                         -- who performed it
  action text NOT NULL,                  -- 'role.assigned' | 'role.removed'
  target_user_id uuid,                   -- whose role changed
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================
-- TRIGGERS that fan-out notifications
-- =========================================

-- New chat message → notify all other users (simple v1; could be channel-scoped membership later)
CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  WHERE p.id <> NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_message ON public.chat_messages;
CREATE TRIGGER trg_notify_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message();

-- New mentorship note → notify the other participant
CREATE OR REPLACE FUNCTION public.notify_mentorship_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  author_name text;
  recipient uuid;
BEGIN
  SELECT mentor_id, mentee_id INTO m FROM public.mentorships WHERE id = NEW.mentorship_id;
  IF m IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(full_name, ''), email, 'Your partner')
    INTO author_name FROM public.profiles WHERE id = NEW.author_id;

  recipient := CASE WHEN NEW.author_id = m.mentor_id THEN m.mentee_id ELSE m.mentor_id END;

  INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
  VALUES (
    recipient,
    'mentorship_note',
    author_name || ' added a check-in note',
    LEFT(NEW.body, 140),
    '/mentorship',
    jsonb_build_object('mentorship_id', NEW.mentorship_id, 'note_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mentorship_note ON public.mentorship_notes;
CREATE TRIGGER trg_notify_mentorship_note
AFTER INSERT ON public.mentorship_notes
FOR EACH ROW EXECUTE FUNCTION public.notify_mentorship_note();

-- New event → notify everyone (announcement)
CREATE OR REPLACE FUNCTION public.notify_new_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
  SELECT
    p.id,
    'event',
    'New event: ' || NEW.title,
    COALESCE(NEW.location, '') || CASE WHEN NEW.location IS NOT NULL THEN ' · ' ELSE '' END
      || to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Mon DD, HH24:MI'),
    '/events/' || NEW.id::text,
    jsonb_build_object('event_id', NEW.id)
  FROM public.profiles p
  WHERE p.id <> NEW.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_event ON public.events;
CREATE TRIGGER trg_notify_new_event
AFTER INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public.notify_new_event();

-- Role assignment → notify recipient + write audit log
CREATE OR REPLACE FUNCTION public.notify_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (
      NEW.user_id,
      'role_change',
      'You are now a ' || NEW.role::text,
      'An admin updated your role.',
      '/dashboard'
    );
    INSERT INTO public.audit_log (actor_id, action, target_user_id, details)
    VALUES (auth.uid(), 'role.assigned', NEW.user_id, jsonb_build_object('role', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, action, target_user_id, details)
    VALUES (auth.uid(), 'role.removed', OLD.user_id, jsonb_build_object('role', OLD.role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_role_change_ins ON public.user_roles;
CREATE TRIGGER trg_role_change_ins
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.notify_role_change();

DROP TRIGGER IF EXISTS trg_role_change_del ON public.user_roles;
CREATE TRIGGER trg_role_change_del
AFTER DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.notify_role_change();

-- =========================================
-- AVATARS storage bucket (for profile uploads)
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );