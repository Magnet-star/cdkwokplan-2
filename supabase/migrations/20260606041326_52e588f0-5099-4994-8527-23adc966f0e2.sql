
ALTER TABLE public.driver_logs
  ADD COLUMN IF NOT EXISTS fuel_order_amount numeric,
  ADD COLUMN IF NOT EXISTS fuel_litres numeric;
