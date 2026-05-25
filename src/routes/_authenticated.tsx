import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Church, LayoutDashboard, ClipboardList, Car, BookText, FileBarChart, Users, LogOut, Building2, Truck, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import dioceseLogo from "@/assets/diocese-logo.jpg";
import { OfficeAttendanceButton } from "@/components/OfficeAttendanceButton";
import { NotificationBell } from "@/components/NotificationBell";

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
    { to: "/drivers-log", label: "Drivers Log", icon: Truck, show: true },
    { to: "/daily-log", label: "Daily Log", icon: BookText, show: true },
    { to: "/reports", label: "Monthly Reports", icon: FileBarChart, show: true },
    { to: "/department", label: "My Department", icon: Building2, show: true },
    { to: "/leave-requests", label: "Leave Requests", icon: CalendarDays, show: true },
    { to: "/admin", label: "Administration", icon: Users, show: canViewAll },
  ];

  const roleLabel = isSuperAdmin ? "Super Admin" : isAdministrator ? "Administrator" : isHod ? "Head of Department" : "Staff";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex" style={{ backgroundColor: '#660000' }}>
        <div className="flex items-center gap-2 border-b border-white/20 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white">
            <img src={dioceseLogo} alt="Diocese of Kitale" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-base font-bold leading-tight" style={{ color: "#ffffff", fontFamily: '"Cormorant Garamond", Georgia, serif' }}>Diocese of Kitale</p>
            <p className="text-[11px] font-bold" style={{ color: "#ffffff" }}>Secretariat</p>
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
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-bold text-white transition-colors",
                  active ? "bg-white/20 text-white" : "hover:bg-white/10",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/20 p-4">
          <p className="truncate text-sm font-bold text-white">{profile?.full_name ?? user.email}</p>
          <p className="mt-0.5 text-xs font-bold text-white/70">{roleLabel}</p>
          <Button onClick={() => { signOut().then(() => navigate({ to: "/" })); }} variant="ghost" size="sm" className="mt-3 w-full justify-start font-bold text-white hover:bg-white/10 hover:text-white">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex w-full flex-col">
        <header className="flex items-center justify-between border-b border-white/20 px-4 py-3 md:hidden" style={{ backgroundColor: '#660000' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white">
              <img src={dioceseLogo} alt="Diocese of Kitale" className="h-full w-full object-contain" />
            </div>
            <span className="font-bold" style={{ color: "#ffffff", fontFamily: '"Cormorant Garamond", Georgia, serif' }}>Diocese of Kitale</span>
          </div>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => { signOut().then(() => navigate({ to: "/" })); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        {/* Mobile nav scroller */}
        <nav className="flex gap-1 overflow-x-auto border-b border-white/20 px-3 py-2 md:hidden" style={{ backgroundColor: '#660000' }}>
          {nav.filter((n) => n.show).map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 [&.active]:bg-white/20 [&.active]:text-white" activeOptions={{ exact: false }}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-x-hidden p-4 md:p-8">
          <div className="mb-4 flex justify-end gap-2">
            <NotificationBell />
            <OfficeAttendanceButton />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
