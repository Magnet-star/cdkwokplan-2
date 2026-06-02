
-- Protect a specific super admin account from edits/deletes by anyone else
CREATE OR REPLACE FUNCTION public.protect_samwel_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid := '788b3a81-1631-4b53-a08d-35ce5d605f4e';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id = target_id AND auth.uid() IS DISTINCT FROM target_id THEN
      RAISE EXCEPTION 'This account is protected and cannot be modified';
    END IF;
    RETURN OLD;
  ELSE
    IF (NEW.user_id = target_id OR (TG_OP = 'UPDATE' AND OLD.user_id = target_id))
       AND auth.uid() IS DISTINCT FROM target_id THEN
      RAISE EXCEPTION 'This account is protected and cannot be modified';
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS protect_samwel_user_roles_trg ON public.user_roles;
CREATE TRIGGER protect_samwel_user_roles_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_samwel_user_roles();

CREATE OR REPLACE FUNCTION public.protect_samwel_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid := '788b3a81-1631-4b53-a08d-35ce5d605f4e';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.id = target_id AND auth.uid() IS DISTINCT FROM target_id THEN
      RAISE EXCEPTION 'This account is protected and cannot be modified';
    END IF;
    RETURN OLD;
  ELSE
    IF (TG_OP = 'UPDATE' AND OLD.id = target_id)
       AND auth.uid() IS DISTINCT FROM target_id THEN
      RAISE EXCEPTION 'This account is protected and cannot be modified';
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS protect_samwel_profile_trg ON public.profiles;
CREATE TRIGGER protect_samwel_profile_trg
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_samwel_profile();

-- Ensure he has all key roles (super_admin already present)
INSERT INTO public.user_roles (user_id, role)
SELECT '788b3a81-1631-4b53-a08d-35ce5d605f4e'::uuid, 'super_admin'::app_role
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = '788b3a81-1631-4b53-a08d-35ce5d605f4e' AND role = 'super_admin'
);
