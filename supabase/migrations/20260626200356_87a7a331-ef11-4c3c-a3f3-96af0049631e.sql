
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own session" ON public.user_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own session" ON public.user_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "super admin reads sessions" ON public.user_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "users read own session" ON public.user_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "super admin deletes sessions" ON public.user_sessions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS user_sessions_started_at_idx ON public.user_sessions (started_at DESC);

-- Auto-cleanup: on every insert, drop rows from previous days
CREATE OR REPLACE FUNCTION public.cleanup_old_user_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_sessions
   WHERE started_at < date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_user_sessions ON public.user_sessions;
CREATE TRIGGER trg_cleanup_user_sessions
  AFTER INSERT ON public.user_sessions
  FOR EACH STATEMENT EXECUTE FUNCTION public.cleanup_old_user_sessions();
