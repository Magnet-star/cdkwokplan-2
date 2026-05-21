
-- Allow super admins full management (including delete) on logs and work plans
DROP POLICY IF EXISTS "Super admins manage all logs" ON public.daily_logs;
CREATE POLICY "Super admins manage all logs" ON public.daily_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins manage all work plans" ON public.work_plans;
CREATE POLICY "Super admins manage all work plans" ON public.work_plans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins manage all plan items" ON public.work_plan_items;
CREATE POLICY "Super admins manage all plan items" ON public.work_plan_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
