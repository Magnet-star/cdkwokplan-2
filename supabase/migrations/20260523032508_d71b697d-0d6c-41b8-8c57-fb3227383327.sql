
-- Fix 1: Privilege escalation — explicitly block non-super-admins from inserting/updating/deleting roles
CREATE POLICY "Block self role assignment"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 2: Profiles INSERT — profiles are created via the handle_new_user SECURITY DEFINER trigger.
-- Add a restrictive policy so direct client INSERTs are blocked even if a permissive policy is added later.
CREATE POLICY "Block direct profile insert"
ON public.profiles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Fix 3: Revoke EXECUTE on internal trigger-only SECURITY DEFINER functions from clients.
-- has_role and get_user_department must remain callable (used inside RLS policies).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
