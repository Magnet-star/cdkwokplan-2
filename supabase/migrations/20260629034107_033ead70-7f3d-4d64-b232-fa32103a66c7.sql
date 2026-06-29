ALTER TABLE public.driver_logs
  ADD COLUMN IF NOT EXISTS lost_km_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_km_confirmed_by uuid REFERENCES auth.users(id);