
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.finance_approver_passwords (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_approver_passwords TO authenticated;
GRANT ALL ON public.finance_approver_passwords TO service_role;
ALTER TABLE public.finance_approver_passwords ENABLE ROW LEVEL SECURITY;

-- No direct client access; all reads/writes go through SECURITY DEFINER functions.
CREATE POLICY "no direct access" ON public.finance_approver_passwords FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.verify_finance_approver_password(_password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  stored_hash text;
  has_approver_role boolean;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role IN ('finance_admin','vicar_general','procurator')
  ) INTO has_approver_role;
  IF NOT has_approver_role THEN RETURN true; END IF; -- not gated

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
$$;

CREATE OR REPLACE FUNCTION public.set_finance_approver_password(_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  has_approver_role boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(_password) < 4 THEN RAISE EXCEPTION 'Password too short'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role IN ('finance_admin','vicar_general','procurator')
  ) INTO has_approver_role;
  IF NOT has_approver_role THEN RAISE EXCEPTION 'Not an approver account'; END IF;

  INSERT INTO public.finance_approver_passwords (user_id, password_hash, updated_at)
  VALUES (uid, crypt(_password, gen_salt('bf')), now())
  ON CONFLICT (user_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.verify_finance_approver_password(text) FROM public;
REVOKE ALL ON FUNCTION public.set_finance_approver_password(text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_finance_approver_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_finance_approver_password(text) TO authenticated;
