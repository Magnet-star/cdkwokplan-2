
ALTER TABLE public.finance_requests
  ADD COLUMN IF NOT EXISTS vicar_super_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vicar_super_admin_name text,
  ADD COLUMN IF NOT EXISTS procurator_super_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS procurator_super_admin_name text;

DROP POLICY IF EXISTS "Vicar super admin can view" ON public.finance_requests;
CREATE POLICY "Vicar super admin can view"
  ON public.finance_requests FOR SELECT
  USING (vicar_super_admin_id = auth.uid());

DROP POLICY IF EXISTS "Procurator super admin can view" ON public.finance_requests;
CREATE POLICY "Procurator super admin can view"
  ON public.finance_requests FOR SELECT
  USING (procurator_super_admin_id = auth.uid());
