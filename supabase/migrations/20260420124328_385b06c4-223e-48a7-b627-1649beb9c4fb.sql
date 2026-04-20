-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  capacity INTEGER,
  image_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view events"
  ON public.events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leaders and admins can insert events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Leaders and admins can update events"
  ON public.events FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Leaders and admins can delete events"
  ON public.events FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_events_starts_at ON public.events(starts_at);

-- RSVP status enum
CREATE TYPE public.rsvp_status AS ENUM ('going', 'maybe', 'declined');

-- RSVPs table
CREATE TABLE public.event_rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status public.rsvp_status NOT NULL DEFAULT 'going',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view rsvps"
  ON public.event_rsvps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own rsvp"
  ON public.event_rsvps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rsvp"
  ON public.event_rsvps FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rsvp"
  ON public.event_rsvps FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Leaders and admins can manage any rsvp"
  ON public.event_rsvps FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_event_rsvps_updated_at
  BEFORE UPDATE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_event_rsvps_event ON public.event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_user ON public.event_rsvps(user_id);