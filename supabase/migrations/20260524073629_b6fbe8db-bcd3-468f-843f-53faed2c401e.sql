CREATE POLICY "Administrators view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Administrators view all departments" ON public.departments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Administrators view all work plans" ON public.work_plans
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Administrators view all plan items" ON public.work_plan_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Administrators view all vehicle requests" ON public.vehicle_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Administrators view all logs" ON public.daily_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Administrators view all user roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));