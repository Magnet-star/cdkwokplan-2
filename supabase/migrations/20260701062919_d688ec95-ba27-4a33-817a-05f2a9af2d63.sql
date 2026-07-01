ALTER TABLE public.vehicle_requests
  ADD COLUMN IF NOT EXISTS assigned_vehicle text,
  ADD COLUMN IF NOT EXISTS assigned_driver text;