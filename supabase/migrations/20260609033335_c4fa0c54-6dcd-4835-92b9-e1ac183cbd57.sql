
CREATE TABLE public.department_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text,
  phone text,
  email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_staff TO authenticated;
GRANT ALL ON public.department_staff TO service_role;

ALTER TABLE public.department_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view department staff"
  ON public.department_staff FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage all department staff"
  ON public.department_staff FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "HODs insert staff in own department"
  ON public.department_staff FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hod')
    AND department_id = public.get_user_department(auth.uid())
  );

CREATE POLICY "HODs update staff in own department"
  ON public.department_staff FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'hod')
    AND department_id = public.get_user_department(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hod')
    AND department_id = public.get_user_department(auth.uid())
  );

CREATE POLICY "HODs delete staff in own department"
  ON public.department_staff FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'hod')
    AND department_id = public.get_user_department(auth.uid())
  );

CREATE TRIGGER department_staff_touch_updated_at
  BEFORE UPDATE ON public.department_staff
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
