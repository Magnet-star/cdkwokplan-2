
CREATE POLICY "HOD uploads to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'uploaded-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND has_role(auth.uid(), 'hod'::app_role)
  );

CREATE POLICY "Users view own report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploaded-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Super admins view all report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploaded-reports' AND has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "HODs view dept report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'uploaded-reports'
    AND has_role(auth.uid(), 'hod'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.uploaded_reports ur
      WHERE ur.file_path = storage.objects.name
        AND ur.department_id = get_user_department(auth.uid())
    )
  );

CREATE POLICY "Users delete own report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploaded-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Super admins delete all report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploaded-reports' AND has_role(auth.uid(), 'super_admin'::app_role));
