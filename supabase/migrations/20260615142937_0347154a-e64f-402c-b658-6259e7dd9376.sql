
CREATE TABLE public.clergy_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clergy_id UUID NOT NULL REFERENCES public.clergy_members(id) ON DELETE CASCADE,
  parish TEXT,
  position TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX clergy_assignments_clergy_id_idx ON public.clergy_assignments(clergy_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clergy_assignments TO authenticated;
GRANT ALL ON public.clergy_assignments TO service_role;

ALTER TABLE public.clergy_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view clergy assignments"
  ON public.clergy_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert clergy assignments"
  ON public.clergy_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'administrator')
  );

CREATE POLICY "Admins can update clergy assignments"
  ON public.clergy_assignments FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'administrator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'administrator')
  );

CREATE POLICY "Admins can delete clergy assignments"
  ON public.clergy_assignments FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'administrator')
  );

CREATE TRIGGER clergy_assignments_touch_updated_at
  BEFORE UPDATE ON public.clergy_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
