
-- Add disbursement tracking columns for CDK Accounts (administrator) office
ALTER TABLE public.finance_requests
  ADD COLUMN IF NOT EXISTS accounts_disbursement_status text,
  ADD COLUMN IF NOT EXISTS accounts_disbursement_by uuid,
  ADD COLUMN IF NOT EXISTS accounts_disbursement_name text,
  ADD COLUMN IF NOT EXISTS accounts_disbursement_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounts_disbursement_note text;

-- Allow Administrator role (CDK Accounts) to view and update finance requests
DROP POLICY IF EXISTS "Administrator can view finance requests" ON public.finance_requests;
CREATE POLICY "Administrator can view finance requests"
  ON public.finance_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'administrator'));

DROP POLICY IF EXISTS "Administrator can update disbursement" ON public.finance_requests;
CREATE POLICY "Administrator can update disbursement"
  ON public.finance_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));
