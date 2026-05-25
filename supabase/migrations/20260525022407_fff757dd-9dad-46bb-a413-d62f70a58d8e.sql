DROP POLICY IF EXISTS "Drivers insert own logs" ON public.driver_logs;
CREATE POLICY "Drivers or super admins insert logs"
  ON public.driver_logs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'driver'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );