CREATE TABLE public.office_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  department_id UUID,
  left_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.office_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own attendance"
  ON public.office_attendance FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins manage all attendance"
  ON public.office_attendance FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "HODs view dept attendance"
  ON public.office_attendance FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'hod'::app_role) AND department_id = get_user_department(auth.uid()));

CREATE TRIGGER trg_office_attendance_updated_at
  BEFORE UPDATE ON public.office_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_office_attendance_user_open
  ON public.office_attendance (user_id) WHERE returned_at IS NULL;
CREATE INDEX idx_office_attendance_left_at
  ON public.office_attendance (left_at DESC);