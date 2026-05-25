DROP POLICY IF EXISTS "Drivers update own pending logs" ON public.driver_logs;

CREATE POLICY "Drivers update own logs"
ON public.driver_logs
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());