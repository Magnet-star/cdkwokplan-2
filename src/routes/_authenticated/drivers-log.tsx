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
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { toast } from "sonner";
import { Truck, CheckCircle2, XCircle, Pencil, Save, X, Trash2, Download, Search } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  vehicle_id: string | null;
  passengers: number | null;
  condition_start: string | null;
  condition_end: string | null;
  fuel_order_amount: number | null;
  fuel_litres: number | null;
  status: string;
  approver_notes: string | null;
  approved_at: string | null;
}

interface Dept { id: string; name: string; hod_id: string | null }
interface Profile { id: string; full_name: string }
interface Vehicle { id: string; registration: string; make_model: string | null; active: boolean }

function DriversLogPage() {
  const { user, isDriver, isHod, isSuperAdmin, isProtectedSuperAdmin, canViewAll, profile, rolesLoaded } = useAuth();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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
    vehicle_id: "",
    passengers: "1",
    condition_start: "",
    condition_end: "",
    fuel_order_amount: "",
    fuel_litres: "",
  };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ closing_km: "", condition_end: "", condition_start: "", fuel_order_amount: "", fuel_litres: "" });

  const startEdit = (l: DriverLog) => {
    setEditingId(l.id);
    setEditForm({
      closing_km: l.closing_km != null ? String(l.closing_km) : "",
      condition_end: l.condition_end ?? "",
      condition_start: l.condition_start ?? "",
      fuel_order_amount: l.fuel_order_amount != null ? String(l.fuel_order_amount) : "",
      fuel_litres: l.fuel_litres != null ? String(l.fuel_litres) : "",
    });
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("driver_logs").update({
      closing_km: editForm.closing_km ? Number(editForm.closing_km) : null,
      condition_end: editForm.condition_end || null,
      condition_start: editForm.condition_start || null,
      fuel_order_amount: editForm.fuel_order_amount ? Number(editForm.fuel_order_amount) : null,
      fuel_litres: editForm.fuel_litres ? Number(editForm.fuel_litres) : null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Log updated");
    setEditingId(null);
    load();
  };

  const deleteLog = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this driver log? This cannot be undone.")) return;
    const { error } = await supabase.from("driver_logs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Log deleted");
    load();
  };

  const load = async () => {
    const [{ data: d }, { data: vh }, { data: l }] = await Promise.all([
      supabase.from("departments").select("id,name,hod_id"),
      supabase.from("vehicles").select("id,registration,make_model,active").order("registration"),
      supabase.from("driver_logs").select("*").order("log_date", { ascending: false }).limit(200),
    ]);
    setDepts((d as Dept[]) ?? []);
    setVehicles((vh as Vehicle[]) ?? []);
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
    if (!form.vehicle_id) { toast.error("Select which vehicle you are using"); return; }
    setBusy(true);
    const { error } = await supabase.from("driver_logs").insert({
      user_id: user.id,
      log_date: form.log_date,
      start_point: form.start_point,
      destination: form.destination,
      starting_km: Number(form.starting_km),
      closing_km: form.closing_km ? Number(form.closing_km) : null,
      department_id: form.department_id,
      vehicle_id: form.vehicle_id,
      passengers: form.passengers ? Number(form.passengers) : 0,
      condition_start: form.condition_start || null,
      condition_end: form.condition_end || null,
      fuel_order_amount: form.fuel_order_amount ? Number(form.fuel_order_amount) : null,
      fuel_litres: form.fuel_litres ? Number(form.fuel_litres) : null,
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
  const vehicleLabel = (id: string | null) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.registration}${v.make_model ? " · " + v.make_model : ""}` : "—";
  };

  // Filters
  const [filterDept, setFilterDept] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const filteredLogs = logs.filter((l) => {
    if (filterDept !== "all" && l.department_id !== filterDept) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const hay = `${l.start_point} ${l.destination} ${deptName(l.department_id)} ${drivers[l.user_id]?.full_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const distanceOf = (l: DriverLog) =>
    l.closing_km != null ? Number(l.closing_km) - Number(l.starting_km) : 0;

  // Per-department summary across filtered logs
  const deptSummary = (() => {
    const map = new Map<string, { name: string; trips: number; km: number }>();
    filteredLogs.forEach((l) => {
      const key = l.department_id ?? "none";
      const name = deptName(l.department_id);
      const cur = map.get(key) ?? { name, trips: 0, km: 0 };
      cur.trips += 1;
      cur.km += distanceOf(l);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.km - a.km);
  })();

  const downloadPdf = (period: "daily" | "weekly" | "monthly") => {
    const now = new Date();
    let start: Date; let end: Date; let label: string;
    if (period === "daily") {
      start = new Date(now); start.setHours(0,0,0,0);
      end = new Date(now); end.setHours(23,59,59,999);
      label = `Daily — ${format(now, "PPP")}`;
    } else if (period === "weekly") {
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
      label = `Weekly — ${format(start, "PP")} to ${format(end, "PP")}`;
    } else {
      start = startOfMonth(now);
      end = endOfMonth(now);
      label = `Monthly — ${format(now, "MMMM yyyy")}`;
    }
    const inRange = filteredLogs.filter((l) => isWithinInterval(parseISO(l.log_date), { start, end }));
    if (inRange.length === 0) { toast.error("No logs in the selected period"); return; }

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Drivers Log Report", 14, 14);
    doc.setFontSize(10);
    doc.text(label, 14, 20);
    if (filterDept !== "all") doc.text(`Department filter: ${deptName(filterDept)}`, 14, 26);

    autoTable(doc, {
      startY: filterDept !== "all" ? 30 : 24,
      head: [["Date", "Driver", "Vehicle", "Department", "From", "To", "Start KM", "Close KM", "Distance", "Fuel (L)", "Fuel (KES)", "Cond. start", "Cond. end", "Status"]],
      body: inRange.map((l) => [
        format(parseISO(l.log_date), "yyyy-MM-dd"),
        drivers[l.user_id]?.full_name ?? "—",
        vehicleLabel(l.vehicle_id),
        deptName(l.department_id),
        l.start_point,
        l.destination,
        l.starting_km,
        l.closing_km ?? "—",
        l.closing_km != null ? distanceOf(l).toFixed(1) : "—",
        l.fuel_litres != null ? Number(l.fuel_litres).toFixed(2) : "—",
        l.fuel_order_amount != null ? Number(l.fuel_order_amount).toLocaleString() : "—",
        l.condition_start ?? "—",
        l.condition_end ?? "—",
        l.status,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    // Department summary
    const summary = new Map<string, { name: string; trips: number; km: number; litres: number; money: number }>();
    inRange.forEach((l) => {
      const key = l.department_id ?? "none";
      const cur = summary.get(key) ?? { name: deptName(l.department_id), trips: 0, km: 0, litres: 0, money: 0 };
      cur.trips += 1;
      cur.km += distanceOf(l);
      cur.litres += Number(l.fuel_litres ?? 0);
      cur.money += Number(l.fuel_order_amount ?? 0);
      summary.set(key, cur);
    });
    const totalKm = inRange.reduce((s, l) => s + distanceOf(l), 0);
    const totalLitres = inRange.reduce((s, l) => s + Number(l.fuel_litres ?? 0), 0);
    const totalMoney = inRange.reduce((s, l) => s + Number(l.fuel_order_amount ?? 0), 0);

    autoTable(doc, {
      head: [["Department", "Trips", "Kilometers", "Fuel litres", "Fuel (KES)"]],
      body: [
        ...Array.from(summary.values()).sort((a,b) => b.km - a.km).map((s) => [s.name, s.trips, s.km.toFixed(1), s.litres.toFixed(2), s.money.toLocaleString()]),
        ["TOTAL", inRange.length, totalKm.toFixed(1), totalLitres.toFixed(2), totalMoney.toLocaleString()],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    doc.save(`drivers-log-${period}-${format(now, "yyyy-MM-dd")}.pdf`);
  };


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
            <CardTitle className="font-serif flex items-center gap-2"><Truck className="h-5 w-5" /> New journey entry</CardTitle>
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
              <div className="md:col-span-2">
                <Label>Vehicle used</Label>
                <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                  <SelectTrigger><SelectValue placeholder={vehicles.filter(v=>v.active).length ? "Select vehicle" : "No vehicles registered — ask Super Admin"} /></SelectTrigger>
                  <SelectContent>
                    {vehicles.filter((v) => v.active).map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.registration}{v.make_model ? ` · ${v.make_model}` : ""}</SelectItem>
                    ))}
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
                <Label>Passengers</Label>
                <Input type="number" min="0" value={form.passengers} onChange={(e) => setForm({ ...form, passengers: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Vehicle condition at start</Label>
                <Textarea rows={2} value={form.condition_start} onChange={(e) => setForm({ ...form, condition_start: e.target.value })} />
              </div>
              <div>
                <Label>Fuel order amount (KES)</Label>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 5000" value={form.fuel_order_amount} onChange={(e) => setForm({ ...form, fuel_order_amount: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">Fill after fueling the vehicle.</p>
              </div>
              <div>
                <Label>Fuel litres (after fueling)</Label>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 35.5" value={form.fuel_litres} onChange={(e) => setForm({ ...form, fuel_litres: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">Total litres of fuel added.</p>
              </div>
              <div className="md:col-span-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Closing kilometers and end-of-trip condition will be filled in by the HOD after the journey, to ensure accountability.
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
          <CardTitle className="font-serif">All driver logs</CardTitle>
          <CardDescription>{canViewAll ? "Showing all logs across the diocese." : isHod ? "You can approve logs assigned to your department." : "Read-only view."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[1fr,1fr,auto]">
            <div>
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Driver, route, department…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Filter by department</Label>
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 md:col-span-1">
              <Button size="sm" variant="outline" onClick={() => downloadPdf("daily")}><Download className="mr-1 h-4 w-4" />Daily</Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf("weekly")}><Download className="mr-1 h-4 w-4" />Weekly</Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf("monthly")}><Download className="mr-1 h-4 w-4" />Monthly</Button>
            </div>
          </div>

          {deptSummary.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Vehicle usage by department ({filteredLogs.length} trip{filteredLogs.length === 1 ? "" : "s"})</p>
              <div className="grid gap-1 text-sm md:grid-cols-2">
                {deptSummary.map((s) => (
                  <div key={s.name} className="flex justify-between gap-3">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">{s.trips} trip{s.trips === 1 ? "" : "s"} · {s.km.toFixed(1)} km</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t pt-1 font-medium md:col-span-2">
                  <span>Total kilometers covered</span>
                  <span>{deptSummary.reduce((s, x) => s + x.km, 0).toFixed(1)} km</span>
                </div>
              </div>
            </div>
          )}

          {filteredLogs.length === 0 && <p className="text-sm text-muted-foreground">No logs match the current filter.</p>}
          {filteredLogs.map((l) => (
            <div key={l.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{l.start_point} → {l.destination}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {format(new Date(l.log_date), "PPP")} · Driver: {drivers[l.user_id]?.full_name ?? "—"} · Dept: {deptName(l.department_id)} · Vehicle: {vehicleLabel(l.vehicle_id)}
                  </p>
                </div>
                <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>
                  {l.status}
                </Badge>
              </div>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 md:grid-cols-4">
                <div><span className="text-muted-foreground">Start KM:</span> {l.starting_km}</div>
                <div><span className="text-muted-foreground">Close KM:</span> {l.closing_km ?? "—"}</div>
                <div><span className="text-muted-foreground">Distance:</span> {l.closing_km != null ? (Number(l.closing_km) - Number(l.starting_km)).toFixed(1) : "—"}</div>
                <div><span className="text-muted-foreground">Passengers:</span> {l.passengers ?? 0}</div>
                <div><span className="text-muted-foreground">Fuel (KES):</span> {l.fuel_order_amount != null ? Number(l.fuel_order_amount).toLocaleString() : "—"}</div>
                <div><span className="text-muted-foreground">Fuel litres:</span> {l.fuel_litres != null ? Number(l.fuel_litres).toFixed(2) : "—"}</div>
              </div>
              {editingId === l.id ? (
                <div className="mt-3 grid gap-3 rounded-md border border-dashed border-border p-3 sm:grid-cols-2">
                  <div>
                    <Label>Closing kilometers</Label>
                    <Input type="number" step="0.1" value={editForm.closing_km} onChange={(e) => setEditForm({ ...editForm, closing_km: e.target.value })} />
                  </div>
                  <div>
                    <Label>Fuel order amount (KES)</Label>
                    <Input type="number" min="0" step="0.01" value={editForm.fuel_order_amount} onChange={(e) => setEditForm({ ...editForm, fuel_order_amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Fuel litres (after fueling)</Label>
                    <Input type="number" min="0" step="0.01" value={editForm.fuel_litres} onChange={(e) => setEditForm({ ...editForm, fuel_litres: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Vehicle condition at start</Label>
                    <Textarea rows={2} value={editForm.condition_start} onChange={(e) => setEditForm({ ...editForm, condition_start: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Vehicle condition at end</Label>
                    <Textarea rows={2} value={editForm.condition_end} onChange={(e) => setEditForm({ ...editForm, condition_end: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button size="sm" onClick={() => saveEdit(l.id)}><Save className="mr-1 h-4 w-4" /> Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="mr-1 h-4 w-4" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  {(l.condition_start || l.condition_end) && (
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      {l.condition_start && <div className="break-words"><span className="text-muted-foreground">Condition (start):</span> {l.condition_start}</div>}
                      {l.condition_end && <div className="break-words"><span className="text-muted-foreground">Condition (end):</span> {l.condition_end}</div>}
                    </div>
                  )}
                  {l.approver_notes && <p className="mt-2 text-sm"><span className="text-muted-foreground">Approver notes:</span> {l.approver_notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(isSuperAdmin || (isHod && l.department_id === myDeptId)) && (
                      <Button size="sm" variant="outline" onClick={() => startEdit(l)}>
                        <Pencil className="mr-1 h-4 w-4" /> Update closing details
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
                    {isSuperAdmin && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteLog(l.id)}>
                        <Trash2 className="mr-1 h-4 w-4" /> Delete log
                      </Button>
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
