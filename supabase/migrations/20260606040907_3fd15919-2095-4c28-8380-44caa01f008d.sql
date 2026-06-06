
-- 1. driver_logs: enforce pending status on insert
DROP POLICY IF EXISTS "Drivers or super admins insert logs" ON public.driver_logs;
CREATE POLICY "Drivers or super admins insert logs"
ON public.driver_logs
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (has_role(auth.uid(), 'driver'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  AND status = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
);

-- 2. leave_requests: split ALL policy into INSERT/DELETE/UPDATE with status guard
DROP POLICY IF EXISTS "Users manage own leave requests" ON public.leave_requests;

CREATE POLICY "Users insert own leave requests"
ON public.leave_requests
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND approved_by IS NULL
);

CREATE POLICY "Users view own leave requests"
ON public.leave_requests
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users update own pending leave requests"
ON public.leave_requests
FOR UPDATE
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
);

CREATE POLICY "Users delete own pending leave requests"
ON public.leave_requests
FOR DELETE
USING (user_id = auth.uid() AND status = 'pending');

-- 3. uploaded_reports: restrict DELETE to HOD/super_admin
DROP POLICY IF EXISTS "Users delete own uploaded reports" ON public.uploaded_reports;
CREATE POLICY "HOD or super admin delete own uploaded reports"
ON public.uploaded_reports
FOR DELETE
USING (
  user_id = auth.uid()
  AND (has_role(auth.uid(), 'hod'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- 4. storage: tighten DELETE on uploaded-reports bucket to HOD/super_admin
DROP POLICY IF EXISTS "Users delete own report files" ON storage.objects;
CREATE POLICY "HOD or super admin delete own report files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'uploaded-reports'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (has_role(auth.uid(), 'hod'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);
