CREATE OR REPLACE FUNCTION public.get_super_admin_recipients()
RETURNS TABLE(id uuid, full_name text, department_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, d.name AS department_name
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE ur.role = 'super_admin';
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_recipients() TO authenticated;