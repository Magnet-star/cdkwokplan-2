
-- Diocese leadership positions (fixed roles + free-form holder info)
CREATE TABLE public.diocese_leadership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_key text NOT NULL UNIQUE,
  position_title text NOT NULL,
  holder_name text,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diocese_leadership TO authenticated;
GRANT ALL ON public.diocese_leadership TO service_role;

ALTER TABLE public.diocese_leadership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view leadership"
  ON public.diocese_leadership FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins can insert leadership"
  ON public.diocese_leadership FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update leadership"
  ON public.diocese_leadership FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete leadership"
  ON public.diocese_leadership FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER diocese_leadership_touch
  BEFORE UPDATE ON public.diocese_leadership
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default leadership positions
INSERT INTO public.diocese_leadership (position_key, position_title, sort_order) VALUES
  ('bishop',             'The Bishop',                                1),
  ('bishop_emeritus',    'Bishop Emeritus',                           2),
  ('vicar_general',      'The Vicar General',                         3),
  ('diocesan_secretary', 'Diocesan Secretary',                        4),
  ('ev_west_pokot',      'Episcopal Vicar (West Pokot P. Region)',    5),
  ('ev_trans_nzoia',     'Episcopal Vicar (Trans Nzoia P. Region)',   6),
  ('judicial_vicar',     'Judicial Vicar',                            7),
  ('legal_officer',      'Legal Officer',                             8);

-- Clergy & religious members
CREATE TABLE public.clergy_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  category text NOT NULL DEFAULT 'priest', -- priest | religious_man | religious_woman
  home_parish text,
  ordination_date date,
  current_assignment text,
  assignment_role text, -- parish_priest | curate | other
  other_positions text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clergy_members TO authenticated;
GRANT ALL ON public.clergy_members TO service_role;

ALTER TABLE public.clergy_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view clergy"
  ON public.clergy_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins can insert clergy"
  ON public.clergy_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update clergy"
  ON public.clergy_members FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete clergy"
  ON public.clergy_members FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER clergy_members_touch
  BEFORE UPDATE ON public.clergy_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
