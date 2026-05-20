
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'hod', 'staff');

-- Departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  hod_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  position TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (separate table to prevent privilege escalation)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Security definer to check roles without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Helper to get user's department
CREATE OR REPLACE FUNCTION public.get_user_department(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT department_id FROM public.profiles WHERE id = _user_id
$$;

-- Work plans (weekly)
CREATE TABLE public.work_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  week_start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  signature TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start_date)
);

-- Work plan items (per-day activities)
CREATE TABLE public.work_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_plan_id UUID NOT NULL REFERENCES public.work_plans(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  activity TEXT NOT NULL,
  location TEXT,
  needs_vehicle BOOLEAN NOT NULL DEFAULT false,
  needs_money BOOLEAN NOT NULL DEFAULT false,
  money_amount NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vehicle requests (weekly)
CREATE TABLE public.vehicle_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  week_start_date DATE NOT NULL,
  date_needed DATE NOT NULL,
  time_from TIME,
  time_to TIME,
  destination TEXT NOT NULL,
  purpose TEXT NOT NULL,
  passengers INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  approver_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily logs (challenges & achievements)
CREATE TABLE public.daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  challenges TEXT,
  achievements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, log_date)
);

-- Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

-- Departments policies
CREATE POLICY "Anyone authenticated can view departments" ON public.departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage departments" ON public.departments
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Profiles policies
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Super admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "HODs view dept profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'hod') AND department_id = public.get_user_department(auth.uid())
  );
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Super admins update any profile" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- User roles policies
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Super admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Super admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Work plans policies
CREATE POLICY "Users manage own work plans" ON public.work_plans
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "HODs view dept work plans" ON public.work_plans
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'hod') AND department_id = public.get_user_department(auth.uid())
  );
CREATE POLICY "Super admins view all work plans" ON public.work_plans
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

-- Work plan items policies
CREATE POLICY "Users manage own plan items" ON public.work_plan_items
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.work_plans wp WHERE wp.id = work_plan_id AND wp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.work_plans wp WHERE wp.id = work_plan_id AND wp.user_id = auth.uid())
  );
CREATE POLICY "HODs view dept plan items" ON public.work_plan_items
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'hod') AND EXISTS (
      SELECT 1 FROM public.work_plans wp WHERE wp.id = work_plan_id
      AND wp.department_id = public.get_user_department(auth.uid())
    )
  );
CREATE POLICY "Super admins view all plan items" ON public.work_plan_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

-- Vehicle requests policies
CREATE POLICY "Users manage own vehicle requests" ON public.vehicle_requests
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "HODs view dept vehicle requests" ON public.vehicle_requests
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'hod') AND department_id = public.get_user_department(auth.uid())
  );
CREATE POLICY "Super admins manage all vehicle requests" ON public.vehicle_requests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Daily logs policies
CREATE POLICY "Users manage own logs" ON public.daily_logs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "HODs view dept logs" ON public.daily_logs
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'hod') AND department_id = public.get_user_department(auth.uid())
  );
CREATE POLICY "Super admins view all logs" ON public.daily_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

-- Auto-create profile + staff role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER work_plans_touch BEFORE UPDATE ON public.work_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
