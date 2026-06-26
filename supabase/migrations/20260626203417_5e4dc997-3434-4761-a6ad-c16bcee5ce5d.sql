
CREATE OR REPLACE FUNCTION public.verify_finance_approver_password(_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  stored_hash text;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;

  SELECT lower(email) INTO user_email FROM auth.users WHERE id = uid;
  IF user_email IS NOT NULL AND lower(_password) = user_email THEN
    RETURN true;
  END IF;

  SELECT password_hash INTO stored_hash FROM public.finance_approver_passwords WHERE user_id = uid;
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN stored_hash = crypt(_password, stored_hash);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_finance_approver_password(_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(_password) < 4 THEN RAISE EXCEPTION 'Password too short'; END IF;

  INSERT INTO public.finance_approver_passwords (user_id, password_hash, updated_at)
  VALUES (uid, crypt(_password, gen_salt('bf')), now())
  ON CONFLICT (user_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, updated_at = now();
END;
$function$;
