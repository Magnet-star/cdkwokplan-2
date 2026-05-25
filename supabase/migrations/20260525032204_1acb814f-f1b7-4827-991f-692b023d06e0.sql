CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration text NOT NULL UNIQUE,
  make_model text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view vehicles"
ON public.vehicles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage vehicles"
ON public.vehicles FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER vehicles_touch_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.driver_logs
ADD COLUMN vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;