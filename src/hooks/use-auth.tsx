import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "administrator" | "hod" | "staff" | "driver" | "finance_admin" | "vicar_general" | "procurator";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  department_id: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoaded: boolean;
  isSuperAdmin: boolean;
  isProtectedSuperAdmin: boolean;
  isAdministrator: boolean;
  isHod: boolean;
  isDriver: boolean;
  canViewAll: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const loadProfile = async (uid: string) => {
    const [{ data: p, error: pErr }, { data: r, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    // Only overwrite cached state on successful fetches to avoid losing
    // privileges during transient network blips or token refreshes.
    if (!pErr && p) setProfile(p as Profile);
    if (!rErr && Array.isArray(r)) {
      const next = (r as { role: AppRole }[]).map((x) => x.role);
      setRoles(next);
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(`roles:${uid}`, JSON.stringify(next));
        }
      } catch {}
      setRolesLoaded(true);
    }
  };

  const hydrateFromCache = (uid: string) => {
    try {
      if (typeof window === "undefined") return;
      const cached = localStorage.getItem(`roles:${uid}`);
      if (cached) {
        setRoles(JSON.parse(cached) as AppRole[]);
        setRolesLoaded(true);
      }
    } catch {}
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Token refreshes shouldn't trigger a refetch — keep current roles
        // in place so super admins don't briefly drop to staff defaults.
        if (evt === "TOKEN_REFRESHED" || evt === "USER_UPDATED") return;
        hydrateFromCache(sess.user.id);
        setTimeout(() => { loadProfile(sess.user.id); }, 0);
      } else if (evt === "SIGNED_OUT") {
        setProfile(null);
        setRoles([]);
        setRolesLoaded(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      if (sess?.user) {
        hydrateFromCache(sess.user.id);
        loadProfile(sess.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    user,
    session,
    profile,
    roles,
    loading,
    rolesLoaded,
    isSuperAdmin: roles.includes("super_admin"),
    isAdministrator: roles.includes("administrator"),
    isHod: roles.includes("hod"),
    isDriver: roles.includes("driver"),
    canViewAll: roles.includes("super_admin") || roles.includes("administrator"),
    refresh: async () => { if (user) await loadProfile(user.id); },
    signOut: async () => { await supabase.auth.signOut(); },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
