import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { countWorkingDays } from "@/lib/working-days";
import { toast } from "sonner";
import { CalendarDays, Plus, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leave-requests")({
  component: LeaveRequestsPage,
});

const ANNUAL_LEAVE_DAYS = 21;

interface LR {
  id: string;
  user_id: string;
  department_id: string | null;
  applicant_name: string;
  from_date: string;
  to_date: string;
  days_requested: number;
  contact_while_away: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  approver_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

interface ProfileLite { id: string; full_name: string; department_id: string | null }
interface DeptLite { id: string; name: string }

function LeaveRequestsPage() {
  const { user, profile, isSuperAdmin } = useAuth();
  const [list, setList] = useState<LR[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [depts, setDepts] = useState<Record<string, DeptLite>>({});
  const [showForm, setShowForm] = useState(false);
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    from_date: format(new Date(), "yyyy-MM-dd"),
    to_date: format(new Date(), "yyyy-MM-dd"),
    contact_while_away: "",
    reason: "",
  });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    if (!user) return;
    let q = supabase.from("leave_requests").select("*").order("created_at", { ascending: false });
    if (!isSuperAdmin) q = q.eq("user_id", user.id);
    const { data } = await q;
    const rows = (data as LR[]) ?? [];
    setList(rows);

    if (isSuperAdmin && rows.length) {
      const uids = Array.from(new Set(rows.map((r) => r.user_id)));
      const dids = Array.from(new Set(rows.map((r) => r.department_id).filter(Boolean) as string[]));
      const [{ data: ps }, { data: ds }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, department_id").in("id", uids),
        dids.length ? supabase.from("departments").select("id, name").in("id", dids) : Promise.resolve({ data: [] as DeptLite[] }),
      ]);
      const pmap: Record<string, ProfileLite> = {};
      (ps as ProfileLite[] | null)?.forEach((p) => { pmap[p.id] = p; });
      const dmap: Record<string, DeptLite> = {};
      (ds as DeptLite[] | null)?.forEach((d) => { dmap[d.id] = d; });
      setProfiles(pmap);
      setDepts(dmap);
    }

    const approverIds = Array.from(new Set(rows.map((r) => r.approved_by).filter(Boolean) as string[]));
    if (approverIds.length > 0) {
      const { data: aps } = await supabase.from("profiles").select("id,full_name").in("id", approverIds);
      const m: Record<string, string> = {};
      (aps ?? []).forEach((p: any) => { m[p.id] = p.full_name; });
      setApproverNames(m);
    } else setApproverNames({});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, isSuperAdmin]);

  const daysRequested = useMemo(() => {
    try {
      const a = parseISO(form.from_date);
      const b = parseISO(form.to_date);
      return countWorkingDays(a, b);
    } catch { return 0; }
  }, [form.from_date, form.to_date]);

  const currentYear = new Date().getFullYear();
  const myUsed = useMemo(() => {
    return list
      .filter((l) => l.user_id === user?.id && l.status === "approved" && new Date(l.from_date).getFullYear() === currentYear)
      .reduce((s, l) => s + (l.days_requested || 0), 0);
  }, [list, user, currentYear]);
  const myBalance = ANNUAL_LEAVE_DAYS - myUsed;

  const usedFor = (uid: string) =>
    list.filter((l) => l.user_id === uid && l.status === "approved" && new Date(l.from_date).getFullYear() === currentYear)
      .reduce((s, l) => s + (l.days_requested || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (daysRequested <= 0) { toast.error("End date must be on or after start date"); return; }
    if (daysRequested > myBalance) { toast.error(`Only ${myBalance} leave days remaining this year`); return; }
    if (!form.contact_while_away.trim()) { toast.error("Contact details required"); return; }
    setBusy(true);
    const { error } = await supabase.from("leave_requests").insert({
      user_id: user.id,
      department_id: profile.department_id ?? null,
      applicant_name: profile.full_name,
      from_date: form.from_date,
      to_date: form.to_date,
      days_requested: daysRequested,
      contact_while_away: form.contact_while_away,
      reason: form.reason || null,
      status: "pending",
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Leave request submitted");
      setShowForm(false);
      setForm({ from_date: format(new Date(), "yyyy-MM-dd"), to_date: format(new Date(), "yyyy-MM-dd"), contact_while_away: "", reason: "" });
      load();
    }
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase
      .from("leave_requests")
      .update({ status, approver_notes: notes[id] || null, approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(`Request ${status}`); load(); }
  };

  const statusBadge = (s: LR["status"]) =>
    s === "approved" ? <Badge className="bg-green-600">Approved</Badge>
    : s === "rejected" ? <Badge variant="destructive">Rejected</Badge>
    : <Badge variant="secondary">Pending</Badge>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="h-6 w-6" /> Leave Requests</h1>
          <p className="text-sm text-muted-foreground">{isSuperAdmin ? "Apply for leave, review and approve staff applications." : "Apply for leave and track your balance."}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}><Plus className="mr-2 h-4 w-4" /> New Request</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Annual entitlement</CardDescription><CardTitle className="text-3xl">{ANNUAL_LEAVE_DAYS}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Used ({currentYear})</CardDescription><CardTitle className="text-3xl">{myUsed}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Remaining balance</CardDescription><CardTitle className="text-3xl text-primary">{myBalance}</CardTitle></CardHeader></Card>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>New Leave Application</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Applicant Name</Label>
                <Input value={profile?.full_name ?? ""} disabled />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={profile?.position ? profile.position : "—"} disabled />
              </div>
              <div>
                <Label>Working days requested</Label>
                <Input value={`${daysRequested} day${daysRequested === 1 ? "" : "s"} (excl. weekends & public holidays)`} disabled />
              </div>
              <div>
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" required value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" required value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="contact">Contact while away (phone / email / address)</Label>
                <Input id="contact" required value={form.contact_while_away} onChange={(e) => setForm({ ...form, contact_while_away: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea id="reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit"}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {list.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No leave requests yet.</CardContent></Card>
        )}
        {list.map((l) => {
          const applicantName = isSuperAdmin ? (profiles[l.user_id]?.full_name ?? l.applicant_name) : l.applicant_name;
          const deptName = isSuperAdmin ? (depts[l.department_id ?? ""]?.name ?? "—") : null;
          const balance = isSuperAdmin ? ANNUAL_LEAVE_DAYS - usedFor(l.user_id) : null;
          return (
            <Card key={l.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-base">{applicantName}</CardTitle>
                    <CardDescription>
                      {format(parseISO(l.from_date), "PP")} – {format(parseISO(l.to_date), "PP")} • {l.days_requested} day{l.days_requested === 1 ? "" : "s"}
                      {deptName && ` • ${deptName}`}
                    </CardDescription>
                  </div>
                  {statusBadge(l.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium">Contact while away:</span> {l.contact_while_away}</p>
                {l.reason && <p><span className="font-medium">Reason:</span> {l.reason}</p>}
                {isSuperAdmin && balance !== null && (
                  <p className="text-muted-foreground">Remaining balance after approval would be {balance - (l.status === "approved" ? 0 : l.days_requested)} / {ANNUAL_LEAVE_DAYS} days. Currently used this year: {usedFor(l.user_id)}.</p>
                )}
                {l.approver_notes && <p className="rounded-md bg-muted p-2"><span className="font-medium">Approver notes:</span> {l.approver_notes}</p>}

                {isSuperAdmin && l.status === "pending" && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label htmlFor={`n-${l.id}`}>Approver notes (optional)</Label>
                    <Textarea id={`n-${l.id}`} value={notes[l.id] ?? ""} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide(l.id, "approved")}><Check className="mr-1 h-4 w-4" /> Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => decide(l.id, "rejected")}><X className="mr-1 h-4 w-4" /> Reject</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
