
ALTER TABLE public.driver_logs
  ADD COLUMN IF NOT EXISTS lost_km_trip_description text;

DROP POLICY IF EXISTS "Receiving dept can describe allocated trip" ON public.driver_logs;
CREATE POLICY "Receiving dept can describe allocated trip"
ON public.driver_logs
FOR UPDATE
TO authenticated
USING (
  lost_km_attributed_to IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'administrator')
    OR (
      public.has_role(auth.uid(), 'hod')
      AND public.get_user_department(auth.uid()) = lost_km_attributed_to
    )
  )
)
WITH CHECK (
  lost_km_attributed_to IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'administrator')
    OR (
      public.has_role(auth.uid(), 'hod')
      AND public.get_user_department(auth.uid()) = lost_km_attributed_to
    )
  )
);
