import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Church, LayoutDashboard, ClipboardList, Car, BookText, FileBarChart, Users, LogOut, Building2, Truck, CalendarDays, Eye, ChevronDown, ChevronRight, UsersRound, Lock, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import dioceseLogo from "@/assets/diocese-logo.jpg";
import { OfficeAttendanceButton } from "@/components/OfficeAttendanceButton";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading, profile, isSuperAdmin, isAdministrator, isHod, isDriver, canViewAll, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const nav = [
    { to: "/dashboard", label: "Home", icon: LayoutDashboard, show: true },
    { to: "/work-plans", label: "Work Plans", icon: ClipboardList, show: true },
    { to: "/vehicle-requests", label: "Vehicle Requests", icon: Car, show: true },
    { to: "/all-workplans", label: "All Workplans", icon: ClipboardList, show: canViewAll },
    { to: "/drivers-log", label: "Drivers Log", icon: Truck, show: true },
    { to: "/daily-log", label: "Daily Log", icon: BookText, show: true },
    { to: "/reports", label: "Monthly Reports", icon: FileBarChart, show: true },
    { to: "/department", label: "My Department", icon: Building2, show: true },
    { to: "/leave-requests", label: "Leave Requests", icon: CalendarDays, show: true },
    { to: "/diocese", label: "Diocese at a Glance", icon: Eye, show: true },
    { to: "/secretariat-staff", label: "Secretariat Staff", icon: UsersRound, show: isSuperAdmin },
    { to: "/archive", label: "Archive", icon: Lock, show: true },
  ];

  const adminSegments = [
    { to: "/admin", search: { tab: "vehicles" }, label: "Vehicle approvals" },
    { to: "/admin", search: { tab: "fleet" }, label: "Fleet" },
    { to: "/admin", search: { tab: "events" }, label: "Diocesan events" },
    { to: "/admin", search: { tab: "depts" }, label: "Departments" },
    { to: "/admin", search: { tab: "users" }, label: "Users & roles" },
    { to: "/admin", search: { tab: "allplans" }, label: "Work plans" },
    { to: "/admin", search: { tab: "cleanup" }, label: "Logs & plans" },
    { to: "/admin", search: { tab: "attendance" }, label: "Office attendance" },
  ];

  const isAdminActive = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

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
          {canViewAll && (
            <div className="space-y-1">
              <button
                onClick={() => setAdminOpen((o) => !o)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-bold text-white transition-colors",
                  isAdminActive ? "bg-white/20 text-white" : "hover:bg-white/10",
                )}
              >
                <Users className="h-4 w-4" />
                <span className="flex-1 text-left">Administration</span>
                {adminOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {adminOpen && (
                <div className="ml-2 space-y-0.5 border-l border-white/20 pl-3">
                  {adminSegments.map(({ to, search, label }) => {
                    const currentTab = (location.search as any)?.tab;
                    const active = isAdminActive && currentTab === (search as any).tab;
                    return (
                      <Link
                        key={label}
                        to={to}
                        search={search as any}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-xs font-bold text-white transition-colors",
                          active ? "bg-white/20 text-white" : "hover:bg-white/10",
                        )}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {(() => {
            const guideUrl = isSuperAdmin
              ? "/guides/SuperAdmin_User_Guide.pdf"
              : isHod
                ? "/guides/HOD_User_Guide.pdf"
                : isDriver
                  ? "/guides/Driver_User_Guide.pdf"
                  : null;
            if (!guideUrl) return null;
            return (
              <a
                href={guideUrl}
                download
                className="mt-4 flex items-center gap-3 rounded-md border border-white/30 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                <BookOpen className="h-4 w-4" />
                User Guide
              </a>
            );
          })()}
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
          {canViewAll && (
            <Link to="/admin" search={{ tab: undefined }} className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 [&.active]:bg-white/20 [&.active]:text-white" activeOptions={{ exact: false }}>
              <Users className="h-3.5 w-3.5" /> Administration
            </Link>
          )}
          {(() => {
            const guideUrl = isSuperAdmin
              ? "/guides/SuperAdmin_User_Guide.pdf"
              : isHod
                ? "/guides/HOD_User_Guide.pdf"
                : isDriver
                  ? "/guides/Driver_User_Guide.pdf"
                  : null;
            if (!guideUrl) return null;
            return (
              <a href={guideUrl} download className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">
                <BookOpen className="h-3.5 w-3.5" /> User Guide
              </a>
            );
          })()}
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
