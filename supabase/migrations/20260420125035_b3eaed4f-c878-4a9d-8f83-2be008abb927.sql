-- Channels
CREATE TABLE public.chat_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view channels"
  ON public.chat_channels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert channels"
  ON public.chat_channels FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update channels"
  ON public.chat_channels FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete channels"
  ON public.chat_channels FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Messages
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view messages"
  ON public.chat_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can post own messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own messages"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Leaders and admins can delete any message"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_chat_messages_channel_created ON public.chat_messages(channel_id, created_at);

-- Realtime
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Seed default channel
INSERT INTO public.chat_channels (name, description, is_default)
VALUES ('general', 'Open conversation for the whole fellowship', true);