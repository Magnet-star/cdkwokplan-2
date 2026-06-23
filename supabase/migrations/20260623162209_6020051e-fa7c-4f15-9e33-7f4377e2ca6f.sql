
DO $$ BEGIN
  CREATE TYPE public.finance_request_status AS ENUM ('pending', 'approved', 'rejected', 'adjustment_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.finance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name text NOT NULL,
  requester_signature text NOT NULL,
  mpesa_phone text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  department_name text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  selected_super_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  selected_super_admin_name text,
  status public.finance_request_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),

  finance_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finance_admin_name text,
  finance_admin_decision text,
  finance_admin_note text,
  finance_admin_at timestamptz,

  vicar_general_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vicar_general_name text,
  vicar_general_decision text,
  vicar_general_note text,
  vicar_general_at timestamptz,

  procurator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  procurator_name text,
  procurator_decision text,
  procurator_note text,
  procurator_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_requests TO authenticated;
GRANT ALL ON public.finance_requests TO service_role;

ALTER TABLE public.finance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester can view own finance requests"
  ON public.finance_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Requester can create finance requests"
  ON public.finance_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Requester can delete own pending"
  ON public.finance_requests FOR DELETE TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending');

CREATE POLICY "Selected super admin can view"
  ON public.finance_requests FOR SELECT TO authenticated
  USING (selected_super_admin_id = auth.uid());

CREATE POLICY "Approvers can view all finance requests"
  ON public.finance_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'finance_admin')
    OR public.has_role(auth.uid(), 'vicar_general')
    OR public.has_role(auth.uid(), 'procurator')
  );

CREATE POLICY "Approvers can update finance requests"
  ON public.finance_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'finance_admin')
    OR public.has_role(auth.uid(), 'vicar_general')
    OR public.has_role(auth.uid(), 'procurator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'finance_admin')
    OR public.has_role(auth.uid(), 'vicar_general')
    OR public.has_role(auth.uid(), 'procurator')
  );

CREATE TRIGGER finance_requests_touch
  BEFORE UPDATE ON public.finance_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX finance_requests_requester_idx ON public.finance_requests(requester_id);
CREATE INDEX finance_requests_super_admin_idx ON public.finance_requests(selected_super_admin_id);
CREATE INDEX finance_requests_status_idx ON public.finance_requests(status);
