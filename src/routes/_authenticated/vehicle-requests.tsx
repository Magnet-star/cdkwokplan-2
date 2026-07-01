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
import { format, startOfWeek, endOfWeek, parseISO, addDays } from "date-fns";
import { toast } from "sonner";
import { Car, Plus, Download, Trash2, ChevronDown, ChevronRight, ChevronLeft, FolderOpen, CalendarDays, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadVehicleRequestPDF, downloadWeeklyVehicleRequestPDF } from "@/lib/vehicle-request-pdf";
import { downloadDSWeeklyVehicleRequestsPDF, buildDSWeeklyVehicleRequestsPDF, type DSWeeklyVRRow } from "@/lib/weekly-ds-vehicle-pdf";

interface TripRow {
  date_needed: string;
  time_from: string;
  time_to: string;
  start_point: string;
  destination: string;
  passengers: number;
  purpose: string;
}

const emptyTrip = (): TripRow => ({
  date_needed: format(new Date(), "yyyy-MM-dd"),
  time_from: "09:00",
  time_to: "17:00",
  start_point: "",
  destination: "",
  passengers: 1,
  purpose: "",
});

export const Route = createFileRoute("/_authenticated/vehicle-requests")({
  component: VehicleRequestsRoute,
});

function VehicleRequestsRoute() {
  const { isSuperAdmin, isAdministrator } = useAuth();
  const [tab, setTab] = useState<"all" | "mine">("all");
  if (!isSuperAdmin && !isAdministrator) return <VehicleRequestsPage />;
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-border bg-card p-1">
        <button
          onClick={() => setTab("all")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${tab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          All departments (consolidated)
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          My department request
        </button>
      </div>
      {tab === "all" ? <DSWeeklyVehicleRequestsView /> : <VehicleRequestsPage />}
    </div>
  );
}

interface VR {
  id: string;
  week_start_date: string;
  date_needed: string;
  time_from: string | null;
  time_to: string | null;
  destination: string;
  purpose: string;
  passengers: number | null;
  status: "pending" | "approved" | "rejected";
  approver_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

function VehicleRequestsPage() {
  const { user, profile } = useAuth();
  const [list, setList] = useState<VR[]>([]);
  const [deptName, setDeptName] = useState<string | null>(null);
  const [hodName, setHodName] = useState<string | null>(null);
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [trips, setTrips] = useState<TripRow[]>([emptyTrip()]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<VR | null>(null);
  const [editForm, setEditForm] = useState<TripRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = (r: VR) => {
    const cleaned = (r.destination || "").replace(/\u2192/g, "->");
    const parts = cleaned.split(/\s*->\s*/);
    const start = parts.length >= 2 ? parts[0].trim() : "";
    const dest = parts.length >= 2 ? parts.slice(1).join(" -> ").trim() : cleaned.trim();
    setEditing(r);
    setEditForm({
      date_needed: r.date_needed,
      time_from: r.time_from ?? "09:00",
      time_to: r.time_to ?? "17:00",
      start_point: start,
      destination: dest,
      passengers: r.passengers ?? 1,
      purpose: r.purpose ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing || !editForm) return;
    if (!editForm.date_needed || !editForm.destination.trim()) {
      toast.error("Date and destination are required");
      return;
    }
    setEditBusy(true);
    const { error } = await supabase
      .from("vehicle_requests")
      .update({
        week_start_date: format(startOfWeek(parseISO(editForm.date_needed), { weekStartsOn: 1 }), "yyyy-MM-dd"),
        date_needed: editForm.date_needed,
        time_from: editForm.time_from || null,
        time_to: editForm.time_to || null,
        destination: editForm.start_point.trim()
          ? `${editForm.start_point.trim()} → ${editForm.destination.trim()}`
          : editForm.destination.trim(),
        purpose: editForm.purpose,
        passengers: editForm.passengers,
      })
      .eq("id", editing.id)
      .eq("status", "pending");
    setEditBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Request updated");
    setEditing(null);
    setEditForm(null);
    load();
  };

  const updateTrip = (i: number, patch: Partial<TripRow>) =>
    setTrips((arr) => arr.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTrip = () => setTrips((arr) => [...arr, emptyTrip()]);
  const removeTrip = (i: number) => setTrips((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("vehicle_requests").select("*").eq("user_id", user.id).order("date_needed", { ascending: false });
    const rows = (data as VR[]) ?? [];
    setList(rows);
    const approverIds = Array.from(new Set(rows.map((r) => r.approved_by).filter(Boolean) as string[]));
    if (approverIds.length > 0) {
      const { data: aps } = await supabase.from("profiles").select("id,full_name").in("id", approverIds);
      const m: Record<string, string> = {};
      (aps ?? []).forEach((p: any) => { m[p.id] = p.full_name; });
      setApproverNames(m);
    } else setApproverNames({});
    if (profile?.department_id) {
      const { data: dept } = await supabase.from("departments").select("name,hod_id").eq("id", profile.department_id).maybeSingle();
      setDeptName(dept?.name ?? null);
      if (dept?.hod_id) {
        const { data: hod } = await supabase.from("profiles").select("full_name").eq("id", dept.hod_id).maybeSingle();
        setHodName(hod?.full_name ?? null);
      } else setHodName(null);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, profile?.department_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (trips.some((t) => !t.date_needed || !t.destination.trim())) {
      toast.error("Each trip needs a date and destination");
      return;
    }
    setBusy(true);
    const rows = trips.map((t) => ({
      user_id: user.id,
      department_id: profile?.department_id ?? null,
      week_start_date: format(startOfWeek(parseISO(t.date_needed), { weekStartsOn: 1 }), "yyyy-MM-dd"),
      date_needed: t.date_needed,
      time_from: t.time_from || null,
      time_to: t.time_to || null,
      destination: t.start_point.trim() ? `${t.start_point.trim()} → ${t.destination.trim()}` : t.destination.trim(),
      purpose: t.purpose,
      passengers: t.passengers,
      status: "pending" as const,
    }));
    const { error } = await supabase.from("vehicle_requests").insert(rows);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`${rows.length} vehicle request${rows.length > 1 ? "s" : ""} submitted for approval`);
      setShowForm(false);
      setTrips([emptyTrip()]);
      load();
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Vehicle Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">Approved by the Diocesan Secretary.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}><Plus className="mr-1 h-4 w-4" />New request</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="font-serif">Request a vehicle</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <p className="text-sm text-muted-foreground">Add one or more trip days. All trips will be submitted together.</p>

              <div className="space-y-4">
                {trips.map((t, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">Day {i + 1}</p>
                      {trips.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeTrip(i)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" />Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div><Label>Date</Label><Input type="date" required value={t.date_needed} onChange={(e) => updateTrip(i, { date_needed: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label>From (time)</Label><Input type="time" value={t.time_from} onChange={(e) => updateTrip(i, { time_from: e.target.value })} /></div>
                        <div><Label>To (time)</Label><Input type="time" value={t.time_to} onChange={(e) => updateTrip(i, { time_to: e.target.value })} /></div>
                      </div>
                      <div><Label>Start point</Label><Input placeholder="e.g. Bishop's Office" value={t.start_point} onChange={(e) => updateTrip(i, { start_point: e.target.value })} /></div>
                      <div><Label>Destination</Label><Input required value={t.destination} onChange={(e) => updateTrip(i, { destination: e.target.value })} /></div>
                      <div><Label>Passengers</Label><Input type="number" min={1} required value={t.passengers} onChange={(e) => updateTrip(i, { passengers: Number(e.target.value) })} /></div>
                      <div className="md:col-span-2"><Label>Purpose</Label><Textarea required rows={3} value={t.purpose} onChange={(e) => updateTrip(i, { purpose: e.target.value })} /></div>
                    </div>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addTrip}>
                <Plus className="mr-1 h-4 w-4" />Add another day
              </Button>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={busy}>Submit {trips.length > 1 ? `${trips.length} requests` : "request"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {list.length === 0 && (
          <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Car className="h-8 w-8" /><p>No vehicle requests yet.</p>
          </CardContent></Card>
        )}
        {(() => {
          const meta = {
            fullName: profile?.full_name ?? "—",
            position: profile?.position,
            departmentName: deptName,
            hodName: hodName,
          };
          const groups: Record<string, VR[]> = {};
          list.forEach((r) => {
            const wk = r.week_start_date ?? r.date_needed;
            (groups[`${wk}`] ||= []).push(r);
          });
          const groupList = Object.entries(groups).map(([key, items]) => ({
            key,
            items: items.sort((a, b) => a.date_needed.localeCompare(b.date_needed)),
            weekStart: items[0].week_start_date ?? items[0].date_needed,
          })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

          return groupList.map((g) => {
            if (g.items.length === 1) {
              const r = g.items[0];
              return (
                <Card key={g.key}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-lg">{r.destination}</p>
                        <p className="text-sm text-muted-foreground">{format(parseISO(r.date_needed), "EEEE, MMM d, yyyy")}{r.time_from ? ` · ${r.time_from}–${r.time_to ?? ""}` : ""}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge s={r.status} />
                        {r.status === "approved" && r.approved_by && (
                          <span className="text-[10px] text-muted-foreground">by {approverNames[r.approved_by] ?? "—"}</span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-sm">{r.purpose}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Passengers: {r.passengers ?? 1}</p>
                    {r.approver_notes && (
                      <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs"><strong>Secretary's note:</strong> {r.approver_notes}</p>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      {r.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                          <Pencil className="mr-1 h-4 w-4" />Edit
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => downloadVehicleRequestPDF(r, meta)}>
                        <Download className="mr-1 h-4 w-4" />Download PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            const statuses = Array.from(new Set(g.items.map((i) => i.status)));
            const statusLabel = statuses.length === 1 ? statuses[0] : "mixed";
            const notes = Array.from(new Set(g.items.map((i) => i.approver_notes).filter(Boolean) as string[]));
            return (
              <Card key={g.key}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-serif text-lg">Weekly request — {g.items.length} trips</p>
                      <p className="text-sm text-muted-foreground">Week of {format(parseISO(g.weekStart), "EEEE, MMM d, yyyy")}</p>
                    </div>
                    {statusLabel === "mixed" ? <Badge>mixed</Badge> : <StatusBadge s={statusLabel as VR["status"]} />}
                  </div>
                  <div className="rounded-md border border-border divide-y divide-border">
                    {g.items.map((r) => (
                      <div key={r.id} className="p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{format(parseISO(r.date_needed), "EEE, MMM d")}{r.time_from ? ` · ${r.time_from}–${r.time_to ?? ""}` : ""} — {r.destination}</p>
                            <p className="text-xs text-muted-foreground">{r.purpose} · Passengers: {r.passengers ?? 1}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end">
                              <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                              {r.status === "approved" && r.approved_by && (
                                <span className="text-[10px] text-muted-foreground">by {approverNames[r.approved_by] ?? "—"}</span>
                              )}
                            </div>
                            {r.status === "pending" && (
                              <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {notes.length > 0 && (
                    <div className="rounded-md bg-muted px-3 py-2 text-xs">
                      <strong>Secretary's note{notes.length > 1 ? "s" : ""}:</strong>
                      <ul className="mt-1 list-disc pl-4 space-y-1">
                        {notes.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => downloadWeeklyVehicleRequestPDF(g.items, meta, g.weekStart)}>
                      <Download className="mr-1 h-4 w-4" />Download weekly form
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          });
        })()}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setEditForm(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit vehicle request</DialogTitle>
            <DialogDescription>You can edit a request while it is still pending. Once approved, edits are locked.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Date</Label><Input type="date" value={editForm.date_needed} onChange={(e) => setEditForm({ ...editForm, date_needed: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>From (time)</Label><Input type="time" value={editForm.time_from} onChange={(e) => setEditForm({ ...editForm, time_from: e.target.value })} /></div>
                <div><Label>To (time)</Label><Input type="time" value={editForm.time_to} onChange={(e) => setEditForm({ ...editForm, time_to: e.target.value })} /></div>
              </div>
              <div><Label>Start point</Label><Input value={editForm.start_point} onChange={(e) => setEditForm({ ...editForm, start_point: e.target.value })} /></div>
              <div><Label>Destination</Label><Input value={editForm.destination} onChange={(e) => setEditForm({ ...editForm, destination: e.target.value })} /></div>
              <div><Label>Passengers</Label><Input type="number" min={1} value={editForm.passengers} onChange={(e) => setEditForm({ ...editForm, passengers: Number(e.target.value) })} /></div>
              <div className="md:col-span-2"><Label>Purpose</Label><Textarea rows={3} value={editForm.purpose} onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setEditForm(null); }}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editBusy}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ s }: { s: VR["status"] }) {
  if (s === "approved") return <Badge className="bg-success text-success-foreground">Approved</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

// ============================================================
// Diocesan Secretary / Super Admin consolidated weekly view
// ============================================================

interface DSRow {
  id: string;
  user_id: string;
  department_id: string | null;
  week_start_date: string;
  date_needed: string;
  time_from: string | null;
  time_to: string | null;
  destination: string; // stored as "From -> To" or just To
  purpose: string;
  passengers: number | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  assigned_vehicle: string | null;
  assigned_driver: string | null;
}

function splitRoute(value: string): { start: string; end: string } {
  const cleaned = (value || "").replace(/\u2192/g, "->");
  const parts = cleaned.split(/\s*->\s*/);
  if (parts.length >= 2) return { start: parts[0].trim(), end: parts.slice(1).join(" -> ").trim() };
  return { start: "", end: cleaned.trim() };
}

function weekKey(d: Date) {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function weekLabel(weekStartISO: string) {
  const s = parseISO(weekStartISO);
  const e = addDays(s, 6);
  return `VEHICLE REQUESTS FOR WEEK [${format(s, "EEE MMM d")} TO ${format(e, "EEE MMM d, yyyy")}]`;
}

interface FleetVehicle { id: string; registration: string; make_model: string | null }
interface DriverOption { id: string; full_name: string }

function DSWeeklyVehicleRequestsView() {
  const [rows, setRows] = useState<DSRow[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [prepare, setPrepare] = useState<{ weekStart: string; weekEnd: string; items: DSRow[]; existingPath?: string } | null>(null);
  const [savedRefresh, setSavedRefresh] = useState(0);


  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: vr }, { data: depts }, { data: veh }, { data: driverRoles }] = await Promise.all([
        supabase
          .from("vehicle_requests")
          .select("id,user_id,department_id,week_start_date,date_needed,time_from,time_to,destination,purpose,passengers,status,created_at,assigned_vehicle,assigned_driver")
          .order("date_needed", { ascending: false }),
        supabase.from("departments").select("id,name"),
        supabase.from("vehicles").select("id,registration,make_model").eq("active", true).order("registration"),
        supabase.from("user_roles").select("user_id").eq("role", "driver"),
      ]);
      setRows((vr as DSRow[]) ?? []);
      const map: Record<string, string> = {};
      (depts ?? []).forEach((d: any) => { map[d.id] = d.name; });
      setDepartments(map);
      setVehicles((veh as FleetVehicle[]) ?? []);
      const driverIds = (driverRoles ?? []).map((r: any) => r.user_id);
      if (driverIds.length > 0) {
        const { data: dProfiles } = await supabase
          .from("profiles")
          .select("id,full_name")
          .in("id", driverIds)
          .order("full_name");
        setDrivers((dProfiles as DriverOption[]) ?? []);
      } else setDrivers([]);
      setLoading(false);
    })();
  }, []);

  const todayWeekStart = useMemo(() => weekKey(new Date()), []);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(todayWeekStart);
  const currentWeekStart = selectedWeekStart;
  const currentWeekEnd = useMemo(
    () => format(addDays(parseISO(selectedWeekStart), 6), "yyyy-MM-dd"),
    [selectedWeekStart],
  );
  const isCurrentWeek = selectedWeekStart === todayWeekStart;
  const shiftWeek = (days: number) => {
    const next = addDays(parseISO(selectedWeekStart), days);
    setSelectedWeekStart(format(next, "yyyy-MM-dd"));
  };

  // Group by week_start_date (fallback compute from date_needed)
  const grouped = useMemo(() => {
    const byWeek = new Map<string, DSRow[]>();
    for (const r of rows) {
      const wk = r.week_start_date ?? weekKey(parseISO(r.date_needed));
      const arr = byWeek.get(wk) ?? [];
      arr.push(r);
      byWeek.set(wk, arr);
    }
    return Array.from(byWeek.entries())
      .map(([wk, items]) => ({ weekStart: wk, items }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [rows]);

  const currentWeek = grouped.find((g) => g.weekStart === currentWeekStart);
  const pastWeeks = grouped.filter((g) => g.weekStart !== todayWeekStart && g.weekStart < todayWeekStart);

  // Group past weeks by year -> month
  const byYearMonth = useMemo(() => {
    const map = new Map<number, Map<number, typeof pastWeeks>>();
    for (const g of pastWeeks) {
      const d = parseISO(g.weekStart);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (!map.has(y)) map.set(y, new Map());
      const ym = map.get(y)!;
      if (!ym.has(m)) ym.set(m, []);
      ym.get(m)!.push(g);
    }
    return map;
  }, [pastWeeks]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const toDSRows = (items: DSRow[]): DSWeeklyVRRow[] =>
    items.map((r) => {
      const { start, end } = splitRoute(r.destination);
      return {
        department: departments[r.department_id ?? ""] ?? "—",
        date_needed: r.date_needed,
        time_from: r.time_from,
        time_to: r.time_to,
        from: start,
        destination: end,
        purpose: r.purpose,
        passengers: r.passengers,
      };
    });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Vehicle Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consolidated weekly view for the Diocesan Secretary. Download one PDF per week with all departments' trips.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {/* Selected week */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif">
                {isCurrentWeek ? "This week" : "Selected week"}
              </CardTitle>
              <CardDescription>
                {format(parseISO(currentWeekStart), "EEE, MMM d")} – {format(parseISO(currentWeekEnd), "EEE, MMM d, yyyy")}
                {!isCurrentWeek && <span className="ml-2 text-xs italic">(viewing another week)</span>}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
                <Button size="sm" variant="ghost" onClick={() => shiftWeek(-7)} title="Previous week">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedWeekStart(todayWeekStart)}
                  disabled={isCurrentWeek}
                  title="Jump to current week"
                >
                  <CalendarDays className="mr-1 h-4 w-4" /> This week
                </Button>
                <Button size="sm" variant="ghost" onClick={() => shiftWeek(7)} title="Next week">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button
                size="sm"
                disabled={!currentWeek || currentWeek.items.length === 0}
                onClick={() =>
                  currentWeek &&
                  setPrepare({ weekStart: currentWeekStart, weekEnd: currentWeekEnd, items: currentWeek.items })
                }
              >
                <Download className="mr-1 h-4 w-4" />Download weekly PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!currentWeek || currentWeek.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicle requests submitted for this week yet.</p>
          ) : (
            <WeekBreakdown items={currentWeek.items} departments={departments} />
          )}
        </CardContent>
      </Card>

      {/* Past weeks: current year prior months first, then prior years */}
      {Array.from(byYearMonth.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([year, monthsMap]) => {
          const monthsSorted = Array.from(monthsMap.entries()).sort((a, b) => b[0] - a[0]);
          // If year is current year, show months individually (inline list of week folders for current month, collapsed for older months)
          if (year === currentYear) {
            return (
              <div key={year} className="space-y-3">
                {monthsSorted.map(([month, weeks]) => {
                  const label = format(new Date(year, month, 1), "MMMM yyyy");
                  // Past weeks of current month: show inline as week folders
                  if (month === currentMonth) {
                    return (
                      <div key={month} className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Earlier this month ({label})
                        </h3>
                        {weeks.map((w) => (
                          <WeekFolder
                            key={w.weekStart}
                            weekStart={w.weekStart}
                            items={w.items}
                            departments={departments}
                            onDownload={() =>
                              setPrepare({
                                weekStart: w.weekStart,
                                weekEnd: format(addDays(parseISO(w.weekStart), 6), "yyyy-MM-dd"),
                                items: w.items,
                              })
                            }
                          />
                        ))}
                      </div>
                    );
                  }
                  return (
                    <CollapsibleFolder key={month} label={label} count={weeks.reduce((a, b) => a + b.items.length, 0)} icon="month">
                      {weeks.map((w) => (
                        <WeekFolder
                          key={w.weekStart}
                          weekStart={w.weekStart}
                          items={w.items}
                          departments={departments}
                          onDownload={() =>
                            setPrepare({
                              weekStart: w.weekStart,
                              weekEnd: format(addDays(parseISO(w.weekStart), 6), "yyyy-MM-dd"),
                              items: w.items,
                            })
                          }
                        />
                      ))}
                    </CollapsibleFolder>
                  );
                })}
              </div>
            );
          }
          // Prior years: year folder containing month folders containing week folders
          const yearTotal = monthsSorted.reduce(
            (acc, [, weeks]) => acc + weeks.reduce((a, b) => a + b.items.length, 0),
            0,
          );
          return (
            <CollapsibleFolder key={year} label={String(year)} count={yearTotal} icon="year">
              {monthsSorted.map(([month, weeks]) => {
                const label = format(new Date(year, month, 1), "MMMM yyyy");
                return (
                  <CollapsibleFolder
                    key={month}
                    label={label}
                    count={weeks.reduce((a, b) => a + b.items.length, 0)}
                    icon="month"
                  >
                    {weeks.map((w) => (
                      <WeekFolder
                        key={w.weekStart}
                        weekStart={w.weekStart}
                        items={w.items}
                        departments={departments}
                        onDownload={() =>
                          setPrepare({
                            weekStart: w.weekStart,
                            weekEnd: format(addDays(parseISO(w.weekStart), 6), "yyyy-MM-dd"),
                            items: w.items,
                          })
                        }
                      />
                    ))}
                  </CollapsibleFolder>
                );
              })}
            </CollapsibleFolder>
          );
        })}

      {!loading && grouped.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Car className="h-8 w-8" />
            <p>No vehicle requests on record.</p>
          </CardContent>
        </Card>
      )}

      <PrepareWeeklyPdfDialog
        open={!!prepare}
        onOpenChange={(o) => { if (!o) setPrepare(null); }}
        weekStart={prepare?.weekStart ?? ""}
        weekEnd={prepare?.weekEnd ?? ""}
        items={prepare?.items ?? []}
        departments={departments}
        vehicles={vehicles}
        drivers={drivers}
        existingPath={prepare?.existingPath}
        onUploaded={() => setSavedRefresh((n) => n + 1)}
      />


      <SavedWeeklyPdfs
        refreshKey={savedRefresh}
        onEdit={(ws, we, path) => {
          const items = rows.filter((r) => r.date_needed >= ws && r.date_needed <= we);
          if (items.length === 0) {
            toast.error("No vehicle requests found for that week.");
            return;
          }
          setPrepare({ weekStart: ws, weekEnd: we, items, existingPath: path });
        }}
      />
    </div>
  );
}


interface WPRow {
  id: string;
  user_id: string;
  department_id: string | null;
  status: string;
  signature: string | null;
  submitted_at: string | null;
  week_start_date: string;
}


function PrepareWeeklyPdfDialog({
  open,
  onOpenChange,
  weekStart,
  weekEnd,
  items,
  departments,
  vehicles,
  drivers,
  existingPath,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  weekEnd: string;
  items: DSRow[];
  departments: Record<string, string>;
  vehicles: FleetVehicle[];
  drivers: DriverOption[];
  existingPath?: string;
  onUploaded?: () => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, { vehicle: string; driver: string }>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, { vehicle: string; driver: string }> = {};
    for (const r of items) {
      initial[r.id] = {
        vehicle: r.assigned_vehicle ?? "",
        driver: r.assigned_driver ?? "",
      };
    }
    setAssignments(initial);
  }, [open, weekStart, items]);



  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          a.date_needed.localeCompare(b.date_needed) ||
          (departments[a.department_id ?? ""] ?? "").localeCompare(departments[b.department_id ?? ""] ?? ""),
      ),
    [items, departments],
  );

  const setField = (id: string, field: "vehicle" | "driver", value: string) =>
    setAssignments((a) => ({ ...a, [id]: { vehicle: a[id]?.vehicle ?? "", driver: a[id]?.driver ?? "", [field]: value } }));

  const handleDownload = async () => {
    const rows: DSWeeklyVRRow[] = sorted.map((r) => {
      const { start, end } = splitRoute(r.destination);
      return {
        department: departments[r.department_id ?? ""] ?? "—",
        date_needed: r.date_needed,
        time_from: r.time_from,
        time_to: r.time_to,
        from: start,
        destination: end,
        purpose: r.purpose,
        passengers: r.passengers,
        vehicle: assignments[r.id]?.vehicle ?? "",
        driver: assignments[r.id]?.driver ?? "",
      };
    });
    setUploading(true);
    try {
      const { doc, filename } = buildDSWeeklyVehicleRequestsPDF(rows, weekStart, weekEnd);
      doc.save(filename);
      const blob = doc.output("blob");
      const uploadPath = existingPath ?? `${weekStart}_to_${weekEnd}/${Date.now()}_${filename}`;
      const { error } = await supabase.storage
        .from("weekly-vehicle-pdfs")
        .upload(uploadPath, blob, { contentType: "application/pdf", upsert: !!existingPath });
      if (error) {
        toast.error(`PDF downloaded, but saving to shared folder failed: ${error.message}`);
      } else {
        toast.success(existingPath ? "PDF updated for all super admins" : "PDF downloaded and saved for other super admins");
        onUploaded?.();
      }
    } finally {
      setUploading(false);
      onOpenChange(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Assign vehicles &amp; drivers</DialogTitle>
          <DialogDescription>
            Pick a vehicle and driver for each trip. Leave blank to keep the field empty on the printed PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {sorted.map((r) => {
            const { start, end } = splitRoute(r.destination);
            return (
              <div key={r.id} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">
                  {format(parseISO(r.date_needed), "EEE, MMM d")} · {departments[r.department_id ?? ""] ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {start || "—"} → {end} · Passengers: {r.passengers ?? 1}
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Vehicle</Label>
                    <Select
                      value={assignments[r.id]?.vehicle ?? ""}
                      onValueChange={(v) => setField(r.id, "vehicle", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Leave blank —</SelectItem>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={`${v.registration}${v.make_model ? ` (${v.make_model})` : ""}`}>
                            {v.registration}{v.make_model ? ` — ${v.make_model}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Driver</Label>
                    <Select
                      value={assignments[r.id]?.driver ?? ""}
                      onValueChange={(v) => setField(r.id, "driver", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Leave blank —</SelectItem>
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={d.full_name}>{d.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground">No trips to assign.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleDownload} disabled={sorted.length === 0 || uploading}>
            <Download className="mr-1 h-4 w-4" />{uploading ? "Saving…" : existingPath ? "Download & update saved PDF" : "Download & save PDF"}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeekBreakdown({ items, departments }: { items: DSRow[]; departments: Record<string, string> }) {
  // Group by date, then by department
  const byDate = new Map<string, DSRow[]>();
  for (const r of items) {
    const arr = byDate.get(r.date_needed) ?? [];
    arr.push(r);
    byDate.set(r.date_needed, arr);
  }
  const days = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-4">
      {days.map(([date, dayRows]) => {
        const byDept = new Map<string, DSRow[]>();
        for (const r of dayRows) {
          const key = departments[r.department_id ?? ""] ?? "—";
          const arr = byDept.get(key) ?? [];
          arr.push(r);
          byDept.set(key, arr);
        }
        return (
          <div key={date} className="rounded-md border border-border">
            <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold">
              {format(parseISO(date), "EEEE, MMM d, yyyy")} · {dayRows.length} trip{dayRows.length > 1 ? "s" : ""}
            </div>
            <div className="divide-y divide-border">
              {Array.from(byDept.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([dept, deptRows]) => (
                  <div key={dept} className="p-3">
                    <p className="text-sm font-medium">{dept}</p>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {deptRows.map((r) => {
                        const { start, end } = splitRoute(r.destination);
                        return (
                          <li key={r.id}>
                            <span className="font-medium text-foreground">{start || "—"} → {end}</span>
                            {r.purpose ? ` · ${r.purpose}` : ""} · Passengers: {r.passengers ?? 1}
                            <Badge variant="outline" className="ml-2 text-[10px]">{r.status}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekFolder({
  weekStart,
  items,
  departments,
  onDownload,
}: {
  weekStart: string;
  items: DSRow[];
  departments: Record<string, string>;
  onDownload: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{weekLabel(weekStart)}</span>
          <span className="text-xs text-muted-foreground">· {items.length} trip{items.length > 1 ? "s" : ""}</span>
        </button>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="mr-1 h-3.5 w-3.5" />PDF
        </Button>
        <button type="button" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-border p-3">
          <WeekBreakdown items={items} departments={departments} />
        </div>
      )}
    </div>
  );
}

function CollapsibleFolder({
  label,
  count,
  icon,
  children,
}: {
  label: string;
  count: number;
  icon: "month" | "year";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          {icon === "year" ? `Year ${label}` : label}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {count} trip{count === 1 ? "" : "s"}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && <div className="space-y-2 border-t border-border p-3">{children}</div>}
    </div>
  );
}

interface SavedPdfEntry {
  name: string;
  path: string;
  weekStart: string;
  weekEnd: string;
  created_at: string;
  size: number | null;
}

function SavedWeeklyPdfs({ refreshKey, onEdit }: { refreshKey: number; onEdit?: (weekStart: string, weekEnd: string, path: string) => void }) {
  const [entries, setEntries] = useState<SavedPdfEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setEntries(null);
    const { data: folders, error } = await supabase.storage
      .from("weekly-vehicle-pdfs")
      .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });
    if (error) {
      toast.error(`Could not load saved PDFs: ${error.message}`);
      setEntries([]);
      return;
    }
    const all: SavedPdfEntry[] = [];
    for (const f of folders ?? []) {
      if (!f.name) continue;
      const m = f.name.match(/^(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      const { data: files } = await supabase.storage
        .from("weekly-vehicle-pdfs")
        .list(f.name, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      for (const file of files ?? []) {
        if (!file.name) continue;
        all.push({
          name: file.name,
          path: `${f.name}/${file.name}`,
          weekStart: m[1],
          weekEnd: m[2],
          created_at: (file as any).created_at ?? "",
          size: (file as any).metadata?.size ?? null,
        });
      }
    }
    all.sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.created_at.localeCompare(a.created_at));
    setEntries(all);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [refreshKey]);

  const openPdf = async (path: string) => {
    setBusy(path);
    const { data, error } = await supabase.storage
      .from("weekly-vehicle-pdfs")
      .createSignedUrl(path, 60 * 10);
    setBusy(null);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open PDF");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const removePdf = async (path: string) => {
    if (!confirm("Delete this saved PDF? Other super admins will lose access to it.")) return;
    setBusy(path);
    const { error } = await supabase.storage.from("weekly-vehicle-pdfs").remove([path]);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">Saved weekly PDFs</CardTitle>
        <CardDescription>
          Prepared weekly vehicle request PDFs (with vehicles & drivers filled in) shared with all super admins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prepared PDFs saved yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {entries.map((e) => (
              <div key={e.path} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Week of {format(parseISO(e.weekStart), "MMM d")} – {format(parseISO(e.weekEnd), "MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground">Saved vehicle request PDF</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy === e.path} onClick={() => openPdf(e.path)}>
                    <Download className="mr-1 h-3.5 w-3.5" />Open
                  </Button>
                  {onEdit && (
                    <Button size="sm" variant="outline" disabled={busy === e.path} onClick={() => onEdit(e.weekStart, e.weekEnd, e.path)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />Edit & update
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy === e.path} onClick={() => removePdf(e.path)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

