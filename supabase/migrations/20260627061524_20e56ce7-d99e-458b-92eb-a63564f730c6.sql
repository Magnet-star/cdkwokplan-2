
ALTER TABLE public.driver_logs
  ADD COLUMN IF NOT EXISTS lost_km_attributed_to uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lost_km_attributed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_km_attributed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lost_km_value numeric;

CREATE INDEX IF NOT EXISTS idx_driver_logs_lost_km_dept ON public.driver_logs(lost_km_attributed_to);
CREATE INDEX IF NOT EXISTS idx_driver_logs_vehicle_date ON public.driver_logs(vehicle_id, log_date DESC, created_at DESC);
