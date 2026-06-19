CREATE POLICY "Authenticated users can view profiles directory"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);