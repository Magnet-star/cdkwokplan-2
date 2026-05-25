DROP POLICY IF EXISTS "Block self role assignment" ON public.user_roles;

CREATE POLICY "Only super admins can change roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));