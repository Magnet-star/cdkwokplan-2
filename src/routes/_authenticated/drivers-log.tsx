import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { Truck, CheckCircle2, XCircle, Pencil, Save, X, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/drivers-log")({
  component: DriversLogPage,
});

interface DriverLog {
  id: string;
  user_id: string;
  log_date: string;
  start_point: string;
  destination: string;
  starting_km: number;
  closing_km: number | null;
  department_id: string | null;
  passengers: number | null;
  condition_start: string | null;
  condition_end: string | null;
  status: string;
  approver_notes: string | null;
  approved_at: string | null;
}

interface Dept { id: string; name: string; hod_id: string | null }
interface Profile { id: string; full_name: string }

function DriversLogPage() {
  const { user, isDriver, isHod, isSuperAdmin, canViewAll, profile, rolesLoaded } = useAuth();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [drivers, setDrivers] = useState<Record<string, Profile>>({});
  const [logs, setLogs] = useState<DriverLog[]>([]);
  const [busy, setBusy] = useState(false);

  const empty = {
    log_date: format(new Date(), "yyyy-MM-dd"),
    start_point: "",
    destination: "",
    starting_km: "",
    closing_km: "",
    department_id: "",
    passengers: "1",
    condition_start: "",
    condition_end: "",
  };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ closing_km: "", condition_end: "", condition_start: "" });

  const startEdit = (l: DriverLog) => {
    setEditingId(l.id);
    setEditForm({
      closing_km: l.closing_km != null ? String(l.closing_km) : "",
      condition_end: l.condition_end ?? "",
      condition_start: l.condition_start ?? "",
    });
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("driver_logs").update({
      closing_km: editForm.closing_km ? Number(editForm.closing_km) : null,
      condition_end: editForm.condition_end || null,
      condition_start: editForm.condition_start || null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Log updated");
    setEditingId(null);
    load();
  };


  const load = async () => {
    const [{ data: d }, { data: l }] = await Promise.all([
      supabase.from("departments").select("id,name,hod_id"),
      supabase.from("driver_logs").select("*").order("log_date", { ascending: false }).limit(200),
    ]);
    setDepts((d as Dept[]) ?? []);
    const list = (l as DriverLog[]) ?? [];
    setLogs(list);
    const userIds = Array.from(new Set(list.map((x) => x.user_id)));
    if (userIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id,full_name").in("id", userIds);
      const map: Record<string, Profile> = {};
      ((ps as Profile[]) ?? []).forEach((p) => { map[p.id] = p; });
      setDrivers(map);
    }
  };
  useEffect(() => { load(); }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.department_id) { toast.error("Select the department using the vehicle"); return; }
    setBusy(true);
    const { error } = await supabase.from("driver_logs").insert({
      user_id: user.id,
      log_date: form.log_date,
      start_point: form.start_point,
      destination: form.destination,
      starting_km: Number(form.starting_km),
      closing_km: form.closing_km ? Number(form.closing_km) : null,
      department_id: form.department_id,
      passengers: form.passengers ? Number(form.passengers) : 0,
      condition_start: form.condition_start || null,
      condition_end: form.condition_end || null,
      status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Drivers log submitted for HOD approval");
    setForm(empty);
    load();
  };

  const decide = async (id: string, status: "approved" | "rejected", notes?: string) => {
    if (!user) return;
    const { error } = await supabase.from("driver_logs").update({
      status,
      approver_notes: notes ?? null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Log ${status}`);
    load();
  };

  const myDeptId = profile?.department_id ?? null;
  const canApprove = (l: DriverLog) =>
    l.status === "pending" && (isSuperAdmin || (isHod && l.department_id === myDeptId));

  const deptName = (id: string | null) => depts.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Drivers Log</h1>
        <p className="text-sm text-muted-foreground">Vehicle journey logbook. Drivers (and Super Admins) submit entries; everyone can view. The HOD of the selected department approves.</p>
        {!rolesLoaded && (
          <p className="mt-2 text-xs text-muted-foreground">Loading your permissions…</p>
        )}
        {rolesLoaded && !isDriver && !isSuperAdmin && (
          <p className="mt-2 text-xs text-muted-foreground">You don't have the Driver role, so you can only view logs. Ask a Super Admin to assign you the Driver role from Administration.</p>
        )}
      </div>

      {rolesLoaded && (isDriver || isSuperAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> New journey entry</CardTitle>
            <CardDescription>Submit a trip — the HOD of the department using the vehicle will approve it.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Date</Label>
                <Input type="date" required value={form.log_date} onChange={(e) => setForm({ ...form, log_date: e.target.value })} />
              </div>
              <div>
                <Label>Department using vehicle</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start point</Label>
                <Input required value={form.start_point} onChange={(e) => setForm({ ...form, start_point: e.target.value })} />
              </div>
              <div>
                <Label>Destination</Label>
                <Input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
              </div>
              <div>
                <Label>Starting kilometers</Label>
                <Input type="number" step="0.1" required value={form.starting_km} onChange={(e) => setForm({ ...form, starting_km: e.target.value })} />
              </div>
              <div>
                <Label>Closing kilometers</Label>
                <Input type="number" step="0.1" value={form.closing_km} onChange={(e) => setForm({ ...form, closing_km: e.target.value })} />
              </div>
              <div>
                <Label>Passengers</Label>
                <Input type="number" min="0" value={form.passengers} onChange={(e) => setForm({ ...form, passengers: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Vehicle condition at start</Label>
                <Textarea rows={2} value={form.condition_start} onChange={(e) => setForm({ ...form, condition_start: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Vehicle condition at end</Label>
                <Textarea rows={2} value={form.condition_end} onChange={(e) => setForm({ ...form, condition_end: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for approval"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All driver logs</CardTitle>
          <CardDescription>{canViewAll ? "Showing all logs across the diocese." : isHod ? "You can approve logs assigned to your department." : "Read-only view."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.length === 0 && <p className="text-sm text-muted-foreground">No logs yet.</p>}
          {logs.map((l) => (
            <div key={l.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{l.start_point} → {l.destination}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(l.log_date), "PPP")} · Driver: {drivers[l.user_id]?.full_name ?? "—"} · Dept: {deptName(l.department_id)}
                  </p>
                </div>
                <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>
                  {l.status}
                </Badge>
              </div>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-4">
                <div><span className="text-muted-foreground">Start KM:</span> {l.starting_km}</div>
                <div><span className="text-muted-foreground">Close KM:</span> {l.closing_km ?? "—"}</div>
                <div><span className="text-muted-foreground">Distance:</span> {l.closing_km != null ? (Number(l.closing_km) - Number(l.starting_km)).toFixed(1) : "—"}</div>
                <div><span className="text-muted-foreground">Passengers:</span> {l.passengers ?? 0}</div>
              </div>
              {editingId === l.id ? (
                <div className="mt-3 grid gap-3 rounded-md border border-dashed border-border p-3 md:grid-cols-2">
                  <div>
                    <Label>Closing kilometers</Label>
                    <Input type="number" step="0.1" value={editForm.closing_km} onChange={(e) => setEditForm({ ...editForm, closing_km: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Vehicle condition at start</Label>
                    <Textarea rows={2} value={editForm.condition_start} onChange={(e) => setEditForm({ ...editForm, condition_start: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Vehicle condition at end</Label>
                    <Textarea rows={2} value={editForm.condition_end} onChange={(e) => setEditForm({ ...editForm, condition_end: e.target.value })} />
                  </div>
                  <div className="flex gap-2 md:col-span-2">
                    <Button size="sm" onClick={() => saveEdit(l.id)}><Save className="mr-1 h-4 w-4" /> Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="mr-1 h-4 w-4" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  {(l.condition_start || l.condition_end) && (
                    <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                      {l.condition_start && <div><span className="text-muted-foreground">Condition (start):</span> {l.condition_start}</div>}
                      {l.condition_end && <div><span className="text-muted-foreground">Condition (end):</span> {l.condition_end}</div>}
                    </div>
                  )}
                  {l.approver_notes && <p className="mt-2 text-sm"><span className="text-muted-foreground">Approver notes:</span> {l.approver_notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {l.user_id === user?.id && (
                      <Button size="sm" variant="outline" onClick={() => startEdit(l)}>
                        <Pencil className="mr-1 h-4 w-4" /> Update trip details
                      </Button>
                    )}
                    {canApprove(l) && (
                      <>
                        <Button size="sm" onClick={() => decide(l.id, "approved")}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => {
                          const note = window.prompt("Reason for rejection (optional):") ?? "";
                          decide(l.id, "rejected", note || undefined);
                        }}>
                          <XCircle className="mr-1 h-4 w-4" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}

            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
