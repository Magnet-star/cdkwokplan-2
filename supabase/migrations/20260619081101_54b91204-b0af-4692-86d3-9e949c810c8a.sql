
CREATE POLICY "Super admins read weekly vehicle pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'weekly-vehicle-pdfs' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins upload weekly vehicle pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'weekly-vehicle-pdfs' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins update weekly vehicle pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'weekly-vehicle-pdfs' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins delete weekly vehicle pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'weekly-vehicle-pdfs' AND public.has_role(auth.uid(), 'super_admin'));
