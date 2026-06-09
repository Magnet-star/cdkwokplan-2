
-- Restore full column grants to authenticated, then restrict via RLS to admins only
GRANT SELECT ON public.clergy_members TO authenticated;

DROP POLICY IF EXISTS "Authenticated can view clergy non-phone" ON public.clergy_members;
CREATE POLICY "Admins can view clergy"
  ON public.clergy_members FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'administrator')
  );

-- Drop admin view; recreate as a safe public view (no phone) for non-admins
DROP VIEW IF EXISTS public.clergy_members_admin;

CREATE OR REPLACE VIEW public.clergy_members_public
WITH (security_invoker = false) AS
SELECT id, created_at, updated_at, category, full_name, home_parish,
       ordination_date, current_assignment, assignment_role,
       other_positions, notes, created_by
FROM public.clergy_members;

GRANT SELECT ON public.clergy_members_public TO authenticated;
