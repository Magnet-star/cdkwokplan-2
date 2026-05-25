CREATE POLICY "Authenticated view driver log submitter profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.driver_logs dl WHERE dl.user_id = profiles.id));