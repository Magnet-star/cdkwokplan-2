import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  created_at: string;
  kind: string;
  request_id: string | null;
  recipient_msisdn: number;
  recipient_role: string | null;
  message: string;
  status: string;
};

const KIND_LABEL: Record<string, string> = {
  submission: "Submission notice",
  approved: "Approval update",
  authorized: "Authorization update",
};

function maskPhone(n: number) {
  const s = String(n);
  if (s.length < 6) return s;
  return `${s.slice(0, 5)}****${s.slice(-2)}`;
}

export function SmsTrackerPanel() {
  const { roles } = useAuth();
  // Only finance approvers/authorizers can see the message content and request link.
  const canSeeContent =
    roles.includes("finance_admin") ||
    roles.includes("vicar_general") ||
    roles.includes("procurator");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const start = new Date(day + "T00:00:00");
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      let q = supabase
        .from("sms_logs")
        .select("id, created_at, kind, request_id, recipient_msisdn, recipient_role, message, status")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      if (kind !== "all") q = q.eq("kind", kind);
      const { data } = await q;
      if (alive) { setRows((data as Row[]) ?? []); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [day, kind]);

  const totals = useMemo(() => {
    const t = { all: rows.length, submission: 0, approved: 0, authorized: 0, failed: 0 };
    for (const r of rows) {
      if (r.kind === "submission") t.submission++;
      else if (r.kind === "approved") t.approved++;
      else if (r.kind === "authorized") t.authorized++;
      if (r.status !== "sent") t.failed++;
    }
    return t;
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">SMS Tracker</CardTitle>
        <CardDescription>
          Audit log of finance notification SMS. {canSeeContent
            ? "You can see message content because you are a finance approver/authorizer."
            : "You can see send counts only — message content and request links are hidden for privacy."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div>
            <Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="submission">Submission notice</SelectItem>
                <SelectItem value="approved">Approval update</SelectItem>
                <SelectItem value="authorized">Authorization update</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <Stat label="Total sent" value={totals.all} />
          <Stat label="Submissions" value={totals.submission} />
          <Stat label="Approvals" value={totals.approved} />
          <Stat label="Authorizations" value={totals.authorized} />
        </div>
        {totals.failed > 0 && (
          <p className="text-sm text-destructive">{totals.failed} message(s) not delivered.</p>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Kind</th>
                <th className="p-2">Recipient</th>
                <th className="p-2">Status</th>
                {canSeeContent && <th className="p-2">Message</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canSeeContent ? 5 : 4} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={canSeeContent ? 5 : 4} className="p-4 text-center text-muted-foreground">No SMS sent on this date.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleTimeString()}</td>
                  <td className="p-2">{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className="p-2 whitespace-nowrap">
                    {canSeeContent ? r.recipient_msisdn : maskPhone(r.recipient_msisdn)}
                    {r.recipient_role && <span className="ml-1 text-xs text-muted-foreground">({r.recipient_role})</span>}
                  </td>
                  <td className="p-2">
                    <Badge variant={r.status === "sent" ? "secondary" : "destructive"}>{r.status}</Badge>
                  </td>
                  {canSeeContent && <td className="p-2 max-w-[420px] text-xs">{r.message}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
