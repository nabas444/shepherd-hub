-- Allow all authenticated members (not just leaders) to post devotionals
DROP POLICY IF EXISTS "Leaders and admins can insert devotionals" ON public.devotionals;
DROP POLICY IF EXISTS "Leaders and admins can update devotionals" ON public.devotionals;
DROP POLICY IF EXISTS "Leaders and admins can delete devotionals" ON public.devotionals;

-- Any authenticated user can post a devotional as themselves
CREATE POLICY "Authenticated users can insert own devotionals"
ON public.devotionals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = author_id);

-- Authors can edit their own; leaders/admins can edit any
CREATE POLICY "Authors or leaders can update devotionals"
ON public.devotionals
FOR UPDATE
TO authenticated
USING (
  auth.uid() = author_id
  OR public.has_role(auth.uid(), 'leader')
  OR public.has_role(auth.uid(), 'admin')
);

-- Authors can delete their own; leaders/admins can delete any
CREATE POLICY "Authors or leaders can delete devotionals"
ON public.devotionals
FOR DELETE
TO authenticated
USING (
  auth.uid() = author_id
  OR public.has_role(auth.uid(), 'leader')
  OR public.has_role(auth.uid(), 'admin')
);