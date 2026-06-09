
-- Make the view safe (security invoker, no SECURITY DEFINER property)
DROP VIEW IF EXISTS public.clergy_members_public;

CREATE VIEW public.clergy_members_public
WITH (security_invoker = true) AS
SELECT id, created_at, updated_at, category, full_name, home_parish,
       ordination_date, current_assignment, assignment_role,
       other_positions, notes, created_by
FROM public.clergy_members;

GRANT SELECT ON public.clergy_members_public TO authenticated;

-- Reset base-table policy: allow all authenticated to view ROWS,
-- but phone_number column is revoked from authenticated and only accessible via a SECURITY DEFINER function
DROP POLICY IF EXISTS "Admins can view clergy" ON public.clergy_members;
CREATE POLICY "Authenticated can view clergy rows"
  ON public.clergy_members FOR SELECT
  TO authenticated
  USING (true);

-- Column-level privileges: drop SELECT on phone_number for authenticated
REVOKE SELECT ON public.clergy_members FROM authenticated;
GRANT SELECT (id, created_at, updated_at, category, full_name, home_parish,
              ordination_date, current_assignment, assignment_role,
              other_positions, notes, created_by, phone_number)
  ON public.clergy_members TO authenticated;
REVOKE SELECT (phone_number) ON public.clergy_members FROM authenticated;

-- Admins read phone numbers via this function only
CREATE OR REPLACE FUNCTION public.get_clergy_phone(_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'administrator')
    THEN (SELECT phone_number FROM public.clergy_members WHERE id = _id)
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.get_clergy_phone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clergy_phone(uuid) TO authenticated;
