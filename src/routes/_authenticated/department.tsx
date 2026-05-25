import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { FileBarChart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/department")({
  component: DepartmentPage,
});

function DepartmentPage() {
  const { profile, isSuperAdmin, isAdministrator, isHod } = useAuth();
  const [deptId, setDeptId] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string>("");
  const [staff, setStaff] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const id = profile.department_id;
      if (!id) return;
      setDeptId(id);
      const [{ data: dept }, { data: members }, { data: weekPlans }, { data: recentLogs }] = await Promise.all([
        supabase.from("departments").select("name").eq("id", id).maybeSingle(),
        supabase.from("profiles").select("id,full_name,email,position").eq("department_id", id),
        supabase.from("work_plans").select("id,user_id,week_start_date,status,submitted_at").eq("department_id", id).order("week_start_date", { ascending: false }).limit(20),
        supabase.from("daily_logs").select("id,user_id,log_date,achievements,challenges").eq("department_id", id).order("log_date", { ascending: false }).limit(15),
      ]);
      setDeptName((dept as any)?.name ?? "");
      setStaff((members as any) ?? []);
      setPlans((weekPlans as any) ?? []);
      setLogs((recentLogs as any) ?? []);
    })();
  }, [profile]);

  const nameFor = (uid: string) => staff.find((s) => s.id === uid)?.full_name ?? "—";

  if (!isHod && !isSuperAdmin && !isAdministrator) return <p className="text-muted-foreground">Access denied.</p>;
  if (!deptId) return <p className="text-muted-foreground">You haven't been assigned to a department yet.</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-foreground">{deptName || "My Department"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review staff, work plans, and daily logs in your department.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-serif">Staff ({staff.length})</CardTitle></CardHeader>
        <CardContent>
          {staff.length === 0 ? <p className="text-sm text-muted-foreground">No staff yet.</p> : (
            <ul className="divide-y divide-border">
              {staff.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <div><p className="font-medium">{s.full_name}</p><p className="text-xs text-muted-foreground">{s.position ?? "—"} · {s.email}</p></div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-serif">Recent work plans</CardTitle><CardDescription>Submitted plans appear here.</CardDescription></CardHeader>
        <CardContent>
          {plans.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
            <ul className="divide-y divide-border">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{nameFor(p.user_id)}</p>
                    <p className="text-xs text-muted-foreground">Week of {format(parseISO(p.week_start_date), "MMM d, yyyy")}</p>
                  </div>
                  <Badge variant={p.status === "submitted" ? "default" : "outline"} className={p.status === "submitted" ? "bg-success text-success-foreground" : ""}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-serif">Recent daily logs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {logs.length === 0 ? <p className="text-sm text-muted-foreground">No logs yet.</p> :
            logs.map((l) => (
              <div key={l.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{nameFor(l.user_id)} — {format(parseISO(l.log_date), "MMM d, yyyy")}</p>
                {l.achievements && <p className="mt-1"><span className="font-semibold text-success">Achievements:</span> {l.achievements}</p>}
                {l.challenges && <p className="mt-1"><span className="font-semibold text-destructive">Challenges:</span> {l.challenges}</p>}
              </div>
            ))}
        </CardContent>
      </Card>

      <Link to="/reports"><Button variant="outline"><FileBarChart className="mr-2 h-4 w-4" /> Generate monthly report for a staff member</Button></Link>
    </div>
  );
}
