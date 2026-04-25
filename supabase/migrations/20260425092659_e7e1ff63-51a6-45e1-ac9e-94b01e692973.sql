-- Extend events with registration/payment config
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS requires_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_instructions text,
  ADD COLUMN IF NOT EXISTS registration_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Registrations table
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_proof_url text,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view registrations"
  ON public.event_registrations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert own registration"
  ON public.event_registrations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own registration"
  ON public.event_registrations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own registration"
  ON public.event_registrations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Leaders and admins manage registrations"
  ON public.event_registrations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_event_registrations_updated_at
  BEFORE UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-registrations', 'event-registrations', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view registration uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-registrations');

CREATE POLICY "Users upload to own registration folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-registrations'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own registration uploads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-registrations'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own registration uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-registrations'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Leaders manage all registration uploads"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'event-registrations'
    AND (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    bucket_id = 'event-registrations'
    AND (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );
