import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, startOfWeek } from "date-fns";
import { ClipboardList, Car, BookText, FileBarChart, ArrowRight, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface Stats {
  thisWeekPlan: { id: string; status: string } | null;
  pendingVehicles: number;
  myVehicles: number;
  daysLogged: number;
}

interface Submission { kind: "plan" | "log" | "vehicle"; id: string; user: string; when: string; label: string; status?: string }

function Dashboard() {
  const { profile, user, isSuperAdmin, isHod } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [feed, setFeed] = useState<Submission[]>([]);

  useEffect(() => {
    if (!user) return;
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    (async () => {
      const [plan, myVeh, logs, deptRow] = await Promise.all([
        supabase.from("work_plans").select("id,status").eq("user_id", user.id).eq("week_start_date", weekStart).maybeSingle(),
        supabase.from("vehicle_requests").select("id,status").eq("user_id", user.id).gte("week_start_date", weekStart),
        supabase.from("daily_logs").select("id").eq("user_id", user.id).gte("log_date", weekStart),
        profile?.department_id
          ? supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      let pendingVehicles = 0;
      if (isSuperAdmin) {
        const { count } = await supabase.from("vehicle_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
        pendingVehicles = count ?? 0;

        const [{ data: rp }, { data: rl }, { data: rv }, { data: ppl }] = await Promise.all([
          supabase.from("work_plans").select("id,user_id,week_start_date,submitted_at,status").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(10),
          supabase.from("daily_logs").select("id,user_id,log_date,created_at").order("created_at", { ascending: false }).limit(10),
          supabase.from("vehicle_requests").select("id,user_id,destination,date_needed,created_at,status").order("created_at", { ascending: false }).limit(10),
          supabase.from("profiles").select("id,full_name"),
        ]);
        const nameOf = (id: string) => (ppl as any[] | null)?.find((p) => p.id === id)?.full_name ?? "Someone";
        const subs: Submission[] = [
          ...((rp as any[]) ?? []).map((p) => ({ kind: "plan" as const, id: p.id, user: nameOf(p.user_id), when: p.submitted_at ?? p.week_start_date, label: `Work plan for week of ${format(new Date(p.week_start_date), "MMM d")}`, status: p.status })),
          ...((rl as any[]) ?? []).map((l) => ({ kind: "log" as const, id: l.id, user: nameOf(l.user_id), when: l.created_at, label: `Daily log · ${format(new Date(l.log_date), "MMM d")}` })),
          ...((rv as any[]) ?? []).map((v) => ({ kind: "vehicle" as const, id: v.id, user: nameOf(v.user_id), when: v.created_at, label: `Vehicle: ${v.destination} (${format(new Date(v.date_needed), "MMM d")})`, status: v.status })),
        ].sort((a, b) => +new Date(b.when) - +new Date(a.when)).slice(0, 12);
        setFeed(subs);
      }

      setStats({
        thisWeekPlan: (plan.data as { id: string; status: string } | null) ?? null,
        pendingVehicles,
        myVehicles: myVeh.data?.length ?? 0,
        daysLogged: logs.data?.length ?? 0,
      });
      setDept((deptRow.data as { name: string } | null)?.name ?? null);
    })();
  }, [user, profile?.department_id, isSuperAdmin]);

  const weekLabel = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "MMMM d, yyyy");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="font-serif text-3xl text-foreground md:text-4xl">{profile?.full_name ?? "Friend"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dept ? <>Department: <span className="font-medium text-foreground">{dept}</span> · </> : "No department assigned yet · "}
          Week of {weekLabel}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ClipboardList} title="This week's plan" value={stats?.thisWeekPlan ? (stats.thisWeekPlan.status === "submitted" ? "Submitted" : "Draft") : "Not started"} tone={stats?.thisWeekPlan?.status === "submitted" ? "success" : stats?.thisWeekPlan ? "warning" : "muted"} to="/work-plans" />
        <StatCard icon={Car} title="My vehicle requests (week)" value={String(stats?.myVehicles ?? 0)} to="/vehicle-requests" />
        <StatCard icon={BookText} title="Days logged this week" value={String(stats?.daysLogged ?? 0)} to="/daily-log" />
        <StatCard icon={FileBarChart} title={isSuperAdmin ? "Pending vehicle approvals" : "Monthly reports"} value={isSuperAdmin ? String(stats?.pendingVehicles ?? 0) : "Generate"} to={isSuperAdmin ? "/admin" : "/reports"} tone={isSuperAdmin && (stats?.pendingVehicles ?? 0) > 0 ? "warning" : "muted"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Your Monday checklist</CardTitle>
          <CardDescription>Complete these every Monday for the week ahead.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ChecklistRow done={!!stats?.thisWeekPlan && stats.thisWeekPlan.status === "submitted"} title="Submit your weekly work plan" to="/work-plans" />
          <ChecklistRow done={(stats?.myVehicles ?? 0) > 0} title="Submit vehicle request (if needed)" to="/vehicle-requests" />
          <ChecklistRow done={(stats?.daysLogged ?? 0) > 0} title="Log daily challenges & achievements" to="/daily-log" />
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Recent submissions</CardTitle>
            <CardDescription>Latest work plans, daily logs, and vehicle requests across the diocese.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {feed.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
            {feed.map((s) => (
              <Link key={`${s.kind}-${s.id}`} to="/admin" className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
                <div className="min-w-0">
                  <p className="truncate"><span className="font-medium">{s.user}</span> · {s.label}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(s.when), "PPp")}</p>
                </div>
                <Badge variant={s.kind === "plan" ? "default" : s.kind === "vehicle" ? "secondary" : "outline"}>{s.kind}{s.status ? ` · ${s.status}` : ""}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {(isHod || isSuperAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Leadership</CardTitle>
            <CardDescription>{isSuperAdmin ? "Oversee all departments, approve vehicle requests, and review reports." : "Review your department's work plans, logs and reports."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(isHod || isSuperAdmin) && <Link to="/department"><Button variant="outline">Open department view</Button></Link>}
            {isSuperAdmin && <Link to="/admin"><Button>Administration</Button></Link>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, title, value, to, tone = "muted" }: { icon: any; title: string; value: string; to: string; tone?: "success" | "warning" | "muted" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "text-foreground";
  return (
    <Link to={to}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{title}</p>
          <p className={`mt-1 font-serif text-2xl ${toneClass}`}>{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function ChecklistRow({ done, title, to }: { done: boolean; title: string; to: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 hover:bg-muted">
      <div className="flex items-center gap-3">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${done ? "border-success bg-success text-success-foreground" : "border-border"}`}>{done ? "✓" : ""}</span>
        <span className="text-sm">{title}</span>
      </div>
      {done ? <Badge variant="secondary" className="bg-success/15 text-success">Done</Badge> : <Badge variant="outline">Pending</Badge>}
    </Link>
  );
}
