
-- driver_logs: administrators view + manage
CREATE POLICY "Administrators view all driver logs" ON public.driver_logs
  FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Administrators update driver logs" ON public.driver_logs
  FOR UPDATE USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

-- uploaded_reports: administrators view all, insert own, delete own
CREATE POLICY "Administrators view all uploaded reports" ON public.uploaded_reports
  FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Administrators insert own uploaded reports" ON public.uploaded_reports
  FOR INSERT WITH CHECK (user_id = auth.uid() AND has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Administrators delete own uploaded reports" ON public.uploaded_reports
  FOR DELETE USING (user_id = auth.uid() AND has_role(auth.uid(), 'administrator'::app_role));

-- storage: administrators upload to their folder in uploaded-reports
CREATE POLICY "Administrators upload uploaded-reports to own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'uploaded-reports'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND has_role(auth.uid(), 'administrator'::app_role)
  );
