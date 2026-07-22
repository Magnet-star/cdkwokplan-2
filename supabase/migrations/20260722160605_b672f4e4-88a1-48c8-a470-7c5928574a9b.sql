
CREATE OR REPLACE FUNCTION public.get_vehicles_out_now()
RETURNS TABLE(id uuid, vehicle_registration text, department_name text, driver_name text, start_point text, destination text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dl.id,
         v.registration AS vehicle_registration,
         d.name AS department_name,
         p.full_name AS driver_name,
         dl.start_point,
         dl.destination
  FROM public.driver_logs dl
  LEFT JOIN public.vehicles v ON v.id = dl.vehicle_id
  LEFT JOIN public.departments d ON d.id = dl.department_id
  LEFT JOIN public.profiles p ON p.id = dl.user_id
  WHERE dl.log_date = (now() AT TIME ZONE 'Africa/Nairobi')::date
    AND dl.closing_km IS NULL
    AND dl.status <> 'rejected';
$$;

REVOKE ALL ON FUNCTION public.get_vehicles_out_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vehicles_out_now() TO authenticated;
