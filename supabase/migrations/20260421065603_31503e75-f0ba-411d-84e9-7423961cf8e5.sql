-- Mentorship pairings table
CREATE TABLE public.mentorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  mentee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  focus text,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  ended_at date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, mentee_id, status)
);

ALTER TABLE public.mentorships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view mentorships"
  ON public.mentorships FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leaders and admins can insert mentorships"
  ON public.mentorships FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Leaders and admins can update mentorships"
  ON public.mentorships FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Leaders and admins can delete mentorships"
  ON public.mentorships FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_mentorships_updated_at
  BEFORE UPDATE ON public.mentorships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mentorship notes (check-ins)
CREATE TABLE public.mentorship_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorship_id uuid NOT NULL REFERENCES public.mentorships(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mentorship_notes ENABLE ROW LEVEL SECURITY;

-- Notes visible to mentor, mentee, and leaders/admins
CREATE POLICY "Participants and leaders can view notes"
  ON public.mentorship_notes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'leader'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.mentorships m
      WHERE m.id = mentorship_id
        AND (m.mentor_id = auth.uid() OR m.mentee_id = auth.uid())
    )
  );

CREATE POLICY "Participants and leaders can insert notes"
  ON public.mentorship_notes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id AND (
      has_role(auth.uid(), 'leader'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.mentorships m
        WHERE m.id = mentorship_id
          AND (m.mentor_id = auth.uid() OR m.mentee_id = auth.uid())
      )
    )
  );

CREATE POLICY "Authors can update own notes"
  ON public.mentorship_notes FOR UPDATE TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Authors and leaders can delete notes"
  ON public.mentorship_notes FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR has_role(auth.uid(), 'leader'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_mentorship_notes_updated_at
  BEFORE UPDATE ON public.mentorship_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mentorships_mentor ON public.mentorships(mentor_id);
CREATE INDEX idx_mentorships_mentee ON public.mentorships(mentee_id);
CREATE INDEX idx_mentorship_notes_mentorship ON public.mentorship_notes(mentorship_id);