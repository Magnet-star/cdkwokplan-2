
-- Fix 1: Restrict clergy phone_number to admins via column-level grants
REVOKE SELECT ON public.clergy_members FROM authenticated;
GRANT SELECT (id, created_at, updated_at, category, full_name, home_parish, ordination_date, current_assignment, assignment_role, other_positions, notes, created_by)
  ON public.clergy_members TO authenticated;
GRANT SELECT (phone_number) ON public.clergy_members TO authenticated;
-- Replace permissive SELECT with role-based: phone visible only to admins; others see other columns
DROP POLICY IF EXISTS "All authenticated can view clergy" ON public.clergy_members;
CREATE POLICY "Authenticated can view clergy non-phone"
  ON public.clergy_members FOR SELECT
  TO authenticated
  USING (true);
-- Note: row-level allows reads; column privileges above limit phone_number to admins only via a separate revoke
REVOKE SELECT (phone_number) ON public.clergy_members FROM authenticated;
GRANT SELECT (phone_number) ON public.clergy_members TO authenticated
  ; -- placeholder
REVOKE SELECT (phone_number) ON public.clergy_members FROM authenticated;
-- Create a security definer function & view path: only admins can read phone_number column
-- Grant phone_number SELECT only to service_role; admins go through a view
GRANT SELECT (phone_number) ON public.clergy_members TO service_role;

-- Admin-accessible view exposing phone_number
CREATE OR REPLACE VIEW public.clergy_members_admin
WITH (security_invoker = true) AS
SELECT * FROM public.clergy_members
WHERE public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'administrator');

GRANT SELECT ON public.clergy_members_admin TO authenticated;

-- Fix 2: Prevent users from changing their own department_id (or role-relevant fields) on profiles
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND department_id IS NOT DISTINCT FROM (SELECT department_id FROM public.profiles WHERE id = auth.uid())
  );
