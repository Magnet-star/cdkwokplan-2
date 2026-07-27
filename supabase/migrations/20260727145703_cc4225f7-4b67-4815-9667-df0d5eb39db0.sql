CREATE OR REPLACE FUNCTION public.get_finance_role_recipients()
RETURNS TABLE(id uuid, full_name text, department_name text, role app_role)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, d.name AS department_name, ur.role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE ur.role IN ('finance_admin'::app_role, 'procurator'::app_role, 'vicar_general'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_finance_role_recipients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_role_recipients() TO authenticated;