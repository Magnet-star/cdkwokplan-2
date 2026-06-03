
CREATE TABLE public.uploaded_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  department_id uuid,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  notes text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_reports TO authenticated;
GRANT ALL ON public.uploaded_reports TO service_role;

ALTER TABLE public.uploaded_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HOD uploads own dept reports"
  ON public.uploaded_reports FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND has_role(auth.uid(), 'hod'::app_role)
    AND department_id = get_user_department(auth.uid())
  );

CREATE POLICY "Users view own uploaded reports"
  ON public.uploaded_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "HOD views dept uploaded reports"
  ON public.uploaded_reports FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'hod'::app_role) AND department_id = get_user_department(auth.uid()));

CREATE POLICY "Super admins manage uploaded reports"
  ON public.uploaded_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users delete own uploaded reports"
  ON public.uploaded_reports FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_uploaded_reports_period ON public.uploaded_reports (period_year DESC, period_month DESC);
CREATE INDEX idx_uploaded_reports_user ON public.uploaded_reports (user_id);
