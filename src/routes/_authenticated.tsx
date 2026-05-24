import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Church, LayoutDashboard, ClipboardList, Car, BookText, FileBarChart, Users, LogOut, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading, profile, isSuperAdmin, isAdministrator, isHod, canViewAll, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/work-plans", label: "Work Plans", icon: ClipboardList, show: true },
    { to: "/vehicle-requests", label: "Vehicle Requests", icon: Car, show: true },
    { to: "/daily-log", label: "Daily Log", icon: BookText, show: true },
    { to: "/reports", label: "Monthly Reports", icon: FileBarChart, show: true },
    { to: "/department", label: "My Department", icon: Building2, show: isHod || isSuperAdmin },
    { to: "/admin", label: "Administration", icon: Users, show: isSuperAdmin },
  ];

  const roleLabel = isSuperAdmin ? "Super Admin" : isHod ? "Head of Department" : "Staff";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
            <Church className="h-5 w-5" />
          </div>
          <div>
            <p className="font-serif text-base leading-tight">Diocese of Kitale</p>
            <p className="text-[11px] text-sidebar-foreground/70">Secretariat</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.filter((n) => n.show).map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-sm font-medium">{profile?.full_name ?? user.email}</p>
          <p className="mt-0.5 text-xs text-sidebar-foreground/70">{roleLabel}</p>
          <Button onClick={() => { signOut().then(() => navigate({ to: "/" })); }} variant="ghost" size="sm" className="mt-3 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex w-full flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Church className="h-5 w-5 text-primary" />
            <span className="font-serif">Diocese of Kitale</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { signOut().then(() => navigate({ to: "/" })); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        {/* Mobile nav scroller */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 md:hidden">
          {nav.filter((n) => n.show).map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs hover:bg-muted [&.active]:bg-primary [&.active]:text-primary-foreground" activeOptions={{ exact: false }}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-x-hidden p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
