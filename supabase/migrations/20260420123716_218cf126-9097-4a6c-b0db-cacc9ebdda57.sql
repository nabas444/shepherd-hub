-- Onboarding steps table
CREATE TABLE public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  step_order INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, step_key)
);

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_onboarding_user ON public.onboarding_steps(user_id);

CREATE TRIGGER update_onboarding_steps_updated_at
BEFORE UPDATE ON public.onboarding_steps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: anyone authenticated can read; owner / leader / admin can write
CREATE POLICY "Authenticated users can view onboarding steps"
  ON public.onboarding_steps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owner can update own steps"
  ON public.onboarding_steps FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Leaders and admins can update any step"
  ON public.onboarding_steps FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Leaders and admins can insert steps"
  ON public.onboarding_steps FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete steps"
  ON public.onboarding_steps FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Update new user handler to seed default onboarding steps
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member');

  -- Seed default onboarding journey
  INSERT INTO public.onboarding_steps (user_id, step_key, step_label, step_order) VALUES
    (NEW.id, 'welcomed',     'Welcomed by a leader',         1),
    (NEW.id, 'first_event',  'Attended first event',         2),
    (NEW.id, 'joined_group', 'Joined a ministry or group',   3),
    (NEW.id, 'mentored',     'Paired with a mentor',         4);

  RETURN NEW;
END;
$$;

-- Backfill onboarding steps for any existing users who don't have them
INSERT INTO public.onboarding_steps (user_id, step_key, step_label, step_order)
SELECT p.id, s.step_key, s.step_label, s.step_order
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('welcomed',     'Welcomed by a leader',         1),
    ('first_event',  'Attended first event',         2),
    ('joined_group', 'Joined a ministry or group',   3),
    ('mentored',     'Paired with a mentor',         4)
) AS s(step_key, step_label, step_order)
ON CONFLICT (user_id, step_key) DO NOTHING;