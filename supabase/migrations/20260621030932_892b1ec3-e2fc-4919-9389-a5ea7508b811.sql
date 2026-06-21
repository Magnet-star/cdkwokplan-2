
-- 1. Saved weekly workplan PDFs table
CREATE TABLE public.saved_weekly_workplans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,
  file_path text NOT NULL,
  department_count int NOT NULL DEFAULT 0,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_weekly_workplans TO authenticated;
GRANT ALL ON public.saved_weekly_workplans TO service_role;

ALTER TABLE public.saved_weekly_workplans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view saved weekly workplans"
  ON public.saved_weekly_workplans FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins insert saved weekly workplans"
  ON public.saved_weekly_workplans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins delete saved weekly workplans"
  ON public.saved_weekly_workplans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'administrator'));

CREATE INDEX saved_weekly_workplans_week_idx ON public.saved_weekly_workplans(week_start_date DESC);

-- 2. Storage policies for the workplan-pdfs bucket
CREATE POLICY "Admins list workplan pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'workplan-pdfs'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'administrator'))
  );

CREATE POLICY "Admins upload workplan pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workplan-pdfs'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'administrator'))
  );

CREATE POLICY "Admins delete workplan pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'workplan-pdfs'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'administrator'))
  );

-- 3. Phone -> email lookup for sign-in
CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(_phone text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE phone IS NOT NULL
    AND regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(_phone, '[^0-9]', '', 'g')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO anon, authenticated;
