import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

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
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attendance entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Left</th>
                  <th className="py-2 pr-3">Returned</th>
                  <th className="py-2 pr-3">Duration</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = userMap[r.user_id];
                  const d = deptMap[r.department_id ?? ""];
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{u?.full_name ?? "—"}</td>
                      <td className="py-2 pr-3">{d?.name ?? "—"}</td>
                      <td className="py-2 pr-3">{format(new Date(r.left_at), "PP p")}</td>
                      <td className="py-2 pr-3">{r.returned_at ? format(new Date(r.returned_at), "PP p") : "—"}</td>
                      <td className="py-2 pr-3">{fmtDur(r.left_at, r.returned_at)}</td>
                      <td className="py-2 pr-3">
                        {r.returned_at
                          ? <Badge variant="secondary">Returned</Badge>
                          : <Badge className="bg-amber-500">Out</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
