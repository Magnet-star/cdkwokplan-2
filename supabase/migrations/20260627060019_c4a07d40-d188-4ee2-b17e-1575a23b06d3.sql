
-- 1. department_staff: tighten SELECT
DROP POLICY IF EXISTS "Authenticated can view department staff" ON public.department_staff;
CREATE POLICY "Privileged or same-dept view department staff"
ON public.department_staff
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'administrator')
  OR (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()))
  OR department_id = public.get_user_department(auth.uid())
);

-- 2. profiles: drop broad directory policy; add HOD-wide + administrator policies for cross-dept name resolution
DROP POLICY IF EXISTS "Authenticated users can view profiles directory" ON public.profiles;
CREATE POLICY "HODs view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'hod'));
CREATE POLICY "Administrators view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'administrator'));

-- 3. driver_logs: drop administrator update policy
DROP POLICY IF EXISTS "Administrators update driver logs" ON public.driver_logs;

-- 4. Revoke public/anon EXECUTE on phone lookup; keep callable by service_role for server function
REVOKE EXECUTE ON FUNCTION public.lookup_email_by_phone(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_email_by_phone(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lookup_email_by_phone(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO service_role;
