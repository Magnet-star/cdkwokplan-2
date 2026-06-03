import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TimeGroupedList } from "@/components/TimeGroupedList";

export function AttendanceLogPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: attData }, { data: uData }, { data: dData }] = await Promise.all([
      supabase.from("office_attendance").select("*").order("left_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("id,full_name"),
      supabase.from("departments").select("id,name"),
    ]);
    setRows((attData as any[]) ?? []);
    setUsers((uData as any[]) ?? []);
    setDepts((dData as any[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const deptMap = Object.fromEntries(depts.map((d) => [d.id, d]));

  const fmtDur = (a: string, b: string | null) => {
    if (!b) return "—";
    const ms = new Date(b).getTime() - new Date(a).getTime();
    const mins = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Office attendance log</CardTitle>
        <CardDescription>Track when staff leave and return to the office.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <TimeGroupedList
            items={rows}
            getDate={(r: any) => new Date(r.left_at)}
            keyOf={(r: any) => r.id}
            groupLabel="Office attendance"
            emptyMessage={<p className="text-sm text-muted-foreground">No attendance entries yet.</p>}
            renderItem={(r: any) => {
              const u = userMap[r.user_id];
              const d = deptMap[r.department_id ?? ""];
              return (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{u?.full_name ?? "—"} {d?.name && <span className="text-xs text-muted-foreground">· {d.name}</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      Left {format(new Date(r.left_at), "PP p")} · {r.returned_at ? `Returned ${format(new Date(r.returned_at), "PP p")}` : "Not returned"} · {fmtDur(r.left_at, r.returned_at)}
                    </p>
                  </div>
                  {r.returned_at
                    ? <Badge variant="secondary">Returned</Badge>
                    : <Badge className="bg-amber-500">Out</Badge>}
                </div>
              );
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
