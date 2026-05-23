
ALTER TABLE public.work_plans DROP CONSTRAINT IF EXISTS work_plans_status_check;
ALTER TABLE public.work_plans ADD CONSTRAINT work_plans_status_check
  CHECK (status = ANY (ARRAY['draft','submitted','approved','rejected']));
