import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type Row = {
  id: string;
  user_id: string;
  started_at: string;
  last_seen_at: string;
  full_name: string | null;
  email: string | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(startISO: string, endISO: string) {
  const ms = Math.max(0, new Date(endISO).getTime() - new Date(startISO).getTime());
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  return `${h}h ${m}m`;
}

export function UsersLogPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    // today (local) start
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: sessions } = await supabase
      .from("user_sessions")
      .select("id, user_id, started_at, last_seen_at")
      .gte("started_at", start.toISOString())
      .order("started_at", { ascending: false });
    const ids = Array.from(new Set((sessions ?? []).map((s) => s.user_id)));
    let profMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      profMap = new Map((profs ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
    }
    setRows(
      (sessions ?? []).map((s) => ({
        ...s,
        full_name: profMap.get(s.user_id)?.full_name ?? null,
        email: profMap.get(s.user_id)?.email ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const uniqueUsers = new Set(rows.map((r) => r.user_id)).size;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Users log — today</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {uniqueUsers} unique user{uniqueUsers === 1 ? "" : "s"} · {rows.length} session
            {rows.length === 1 ? "" : "s"} · resets automatically each day
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sign-ins recorded yet today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Signed in</th>
                  <th className="py-2 pr-3">Last active</th>
                  <th className="py-2 pr-3">Time on system</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.full_name || r.email || "Unknown"}</div>
                      {r.email && r.full_name ? (
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.started_at)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.last_seen_at)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDuration(r.started_at, r.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
