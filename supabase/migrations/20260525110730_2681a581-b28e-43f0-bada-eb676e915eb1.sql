-- 1. Restrict driver_logs SELECT
DROP POLICY IF EXISTS "Authenticated view driver logs" ON public.driver_logs;

CREATE POLICY "Drivers view own logs"
ON public.driver_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "HODs view dept driver logs"
ON public.driver_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'hod'::app_role) AND department_id = get_user_department(auth.uid()));

-- 2. Remove overly broad profiles exposure via driver_logs
DROP POLICY IF EXISTS "Authenticated view driver log submitter profiles" ON public.profiles;

-- 3. Remove undefined 'administrator' role policies
DROP POLICY IF EXISTS "Administrators view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Administrators view all departments" ON public.departments;
DROP POLICY IF EXISTS "Administrators view all work plans" ON public.work_plans;
DROP POLICY IF EXISTS "Administrators view all plan items" ON public.work_plan_items;
DROP POLICY IF EXISTS "Administrators view all vehicle requests" ON public.vehicle_requests;
DROP POLICY IF EXISTS "Administrators view all logs" ON public.daily_logs;
DROP POLICY IF EXISTS "Administrators view all user roles" ON public.user_roles;