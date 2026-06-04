
DROP POLICY IF EXISTS "Drivers update own logs" ON public.driver_logs;
CREATE POLICY "Drivers update own pending logs"
ON public.driver_logs
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending' AND approved_by IS NULL)
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
);

DROP POLICY IF EXISTS "HODs view dept leave requests" ON public.leave_requests;
CREATE POLICY "HODs view dept leave requests"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'hod'::app_role)
  AND department_id = get_user_department(auth.uid())
);

DROP POLICY IF EXISTS "HODs update dept leave requests" ON public.leave_requests;
CREATE POLICY "HODs update dept leave requests"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'hod'::app_role)
  AND department_id = get_user_department(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'hod'::app_role)
  AND department_id = get_user_department(auth.uid())
);

DROP POLICY IF EXISTS "Super admins update uploaded reports" ON storage.objects;
CREATE POLICY "Super admins update uploaded reports"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'uploaded-reports' AND has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (bucket_id = 'uploaded-reports' AND has_role(auth.uid(), 'super_admin'::app_role));
