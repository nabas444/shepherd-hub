-- Allow users to self-assign leader or member role to themselves (but never admin)
CREATE POLICY "Users can self-assign leader or member role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role IN ('leader'::app_role, 'member'::app_role)
);