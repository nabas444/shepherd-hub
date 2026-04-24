-- Leader access requests: users can ask to be made a leader; admins approve
CREATE TABLE IF NOT EXISTS public.leader_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  reason text,
  ministry text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leader_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own request
CREATE POLICY "Users view own leader request"
  ON public.leader_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Users can create their own request
CREATE POLICY "Users create own leader request"
  ON public.leader_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Users can update (resubmit) their own pending request; admins can update any
CREATE POLICY "Users update own pending request"
  ON public.leader_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Admins can delete
CREATE POLICY "Admins delete leader requests"
  ON public.leader_requests FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Timestamp trigger
CREATE TRIGGER update_leader_requests_updated_at
  BEFORE UPDATE ON public.leader_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- When a request is approved, notify the user and admins; the role is granted by admin via existing user_roles flow
CREATE OR REPLACE FUNCTION public.notify_leader_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  applicant_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(NULLIF(full_name,''), email, 'A member') INTO applicant_name
      FROM public.profiles WHERE id = NEW.user_id;
    -- Notify all admins
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT ur.user_id, 'leader_request', 'New leader request', applicant_name || ' is requesting leader access.', '/admin'
    FROM public.user_roles ur WHERE ur.role = 'admin';
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (
      NEW.user_id,
      'leader_request',
      CASE WHEN NEW.status = 'approved' THEN 'Leader request approved' ELSE 'Leader request updated' END,
      'Status: ' || NEW.status,
      '/dashboard'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leader_request_notify
  AFTER INSERT OR UPDATE ON public.leader_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leader_request();