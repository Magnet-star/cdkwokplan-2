CREATE TABLE public.driver_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  log_date date NOT NULL,
  start_point text NOT NULL,
  destination text NOT NULL,
  starting_km numeric NOT NULL,
  closing_km numeric,
  department_id uuid REFERENCES public.departments(id),
  passengers integer DEFAULT 0,
  condition_start text,
  condition_end text,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','approved','rejected'])),
  approved_by uuid,
  approved_at timestamptz,
  approver_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view driver logs"
ON public.driver_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Drivers insert own logs"
ON public.driver_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'driver'));

CREATE POLICY "Drivers update own pending logs"
ON public.driver_logs FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Drivers delete own pending logs"
ON public.driver_logs FOR DELETE TO authenticated
USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "HOD approves logs for their dept"
ON public.driver_logs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));

CREATE POLICY "Super admins manage all driver logs"
ON public.driver_logs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER driver_logs_touch
BEFORE UPDATE ON public.driver_logs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();