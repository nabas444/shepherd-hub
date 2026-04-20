CREATE TABLE public.devotionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  scripture_reference TEXT,
  scripture_text TEXT,
  body TEXT NOT NULL,
  author_id UUID NOT NULL,
  publish_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.devotionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view devotionals"
  ON public.devotionals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leaders and admins can insert devotionals"
  ON public.devotionals FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Leaders and admins can update devotionals"
  ON public.devotionals FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Leaders and admins can delete devotionals"
  ON public.devotionals FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'leader') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_devotionals_updated_at
  BEFORE UPDATE ON public.devotionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_devotionals_publish_date ON public.devotionals(publish_date DESC);