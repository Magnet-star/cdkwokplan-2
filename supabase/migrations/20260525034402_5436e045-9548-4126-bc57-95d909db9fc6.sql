
CREATE TABLE public.diocesan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_date date NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  venue text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.diocesan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view diocesan events"
  ON public.diocesan_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins manage diocesan events"
  ON public.diocesan_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_diocesan_events_touch
  BEFORE UPDATE ON public.diocesan_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
