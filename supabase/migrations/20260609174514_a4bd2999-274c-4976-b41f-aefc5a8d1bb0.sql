
CREATE TABLE public.archive_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_credentials TO authenticated;
GRANT ALL ON public.archive_credentials TO service_role;
ALTER TABLE public.archive_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own creds select" ON public.archive_credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own creds insert" ON public.archive_credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own creds update" ON public.archive_credentials FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own creds delete" ON public.archive_credentials FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_archive_creds_updated BEFORE UPDATE ON public.archive_credentials FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.archive_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_documents TO authenticated;
GRANT ALL ON public.archive_documents TO service_role;
ALTER TABLE public.archive_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own docs select" ON public.archive_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own docs insert" ON public.archive_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own docs update" ON public.archive_documents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own docs delete" ON public.archive_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.archive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_date date NOT NULL,
  event_time time,
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_events TO authenticated;
GRANT ALL ON public.archive_events TO service_role;
ALTER TABLE public.archive_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events select" ON public.archive_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own events insert" ON public.archive_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own events update" ON public.archive_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own events delete" ON public.archive_events FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_archive_events_updated BEFORE UPDATE ON public.archive_events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.archive_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_notes TO authenticated;
GRANT ALL ON public.archive_notes TO service_role;
ALTER TABLE public.archive_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes select" ON public.archive_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own notes insert" ON public.archive_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notes update" ON public.archive_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notes delete" ON public.archive_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_archive_notes_updated BEFORE UPDATE ON public.archive_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "own archive read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-archives' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own archive insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-archives' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own archive update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-archives' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own archive delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-archives' AND auth.uid()::text = (storage.foldername(name))[1]);
