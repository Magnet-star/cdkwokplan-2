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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { toast } from "sonner";
import { Truck, CheckCircle2, XCircle, Pencil, Save, X, Trash2, Download, Search, AlertTriangle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  created_at?: string | null;
  lost_km_attributed_to?: string | null;
  lost_km_attributed_at?: string | null;
  lost_km_attributed_by?: string | null;
  lost_km_value?: number | null;
  lost_km_trip_description?: string | null;
  lost_km_confirmed_at?: string | null;
  lost_km_confirmed_by?: string | null;
}

interface Dept { id: string; name: string; hod_id: string | null }
interface Profile { id: string; full_name: string }
interface Vehicle { id: string; registration: string; make_model: string | null; active: boolean }

function DriversLogPage() {
  const { user, isDriver, isHod, isSuperAdmin, isAdministrator, isProtectedSuperAdmin, canViewAll, profile, rolesLoaded } = useAuth();
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
    l.status === "pending" && (isSuperAdmin || isAdministrator || (isHod && l.department_id === myDeptId));
  const canViewLost = (l: DriverLog) =>
    isSuperAdmin || isAdministrator || (isHod && l.department_id === myDeptId);
  const canAttributeLost = (l: DriverLog) =>
    isSuperAdmin || (isHod && l.department_id === myDeptId);

  const deptName = (id: string | null | undefined) => depts.find((d) => d.id === id)?.name ?? "—";
  const vehicleLabel = (id: string | null) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.registration}${v.make_model ? " · " + v.make_model : ""}` : "—";
  };

  // Baseline lost-km calc: previous trip (by date, then created_at) of the same vehicle.
  const vehicleLogsSorted = (vehicleId: string | null) => {
    if (!vehicleId) return [] as DriverLog[];
    return logs
      .filter((x) => x.vehicle_id === vehicleId)
      .slice()
      .sort((a, b) => {
        const ad = a.log_date.localeCompare(b.log_date);
        if (ad !== 0) return ad;
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      });
  };
  const previousClosingFor = (l: DriverLog): number | null => {
    const sorted = vehicleLogsSorted(l.vehicle_id);
    const idx = sorted.findIndex((x) => x.id === l.id);
    for (let i = idx - 1; i >= 0; i--) {
      if (sorted[i].closing_km != null) return Number(sorted[i].closing_km);
    }
    return null;
  };
  const lastDeptForVehicle = (l: DriverLog): string | null => {
    const sorted = vehicleLogsSorted(l.vehicle_id);
    const idx = sorted.findIndex((x) => x.id === l.id);
    const ref = idx >= 0 ? idx : sorted.length;
    for (let i = ref - 1; i >= 0; i--) {
      if (sorted[i].department_id) return deptName(sorted[i].department_id);
    }
    return null;
  };
  const computedLostKm = (l: DriverLog): { value: number; baseline: number | null; firstTrip: boolean } => {
    const baseline = previousClosingFor(l);
    if (baseline == null) return { value: 0, baseline: null, firstTrip: true };
    const diff = Number(l.starting_km) - baseline;
    return { value: diff > 0 ? diff : 0, baseline, firstTrip: false };
  };

  const saveLostAttribution = async (l: DriverLog, deptId: string | null) => {
    if (!user) return;
    const { value } = computedLostKm(l);
    const { error } = await supabase.from("driver_logs").update({
      lost_km_attributed_to: deptId,
      lost_km_attributed_at: deptId ? new Date().toISOString() : null,
      lost_km_attributed_by: deptId ? user.id : null,
      lost_km_value: deptId ? value : null,
      // Re-attribution always resets confirmation and any prior trip description
      lost_km_confirmed_at: null,
      lost_km_confirmed_by: null,
      lost_km_trip_description: null,
    } as any).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(deptId ? "Lost kilometers attributed — awaiting receiving department confirmation" : "Attribution cleared");
    load();
  };

  const confirmAttribution = async (l: DriverLog) => {
    if (!user) return;
    if (!confirm(`Confirm that ${Number(l.lost_km_value ?? 0).toFixed(1)} lost km from ${deptName(l.department_id)} are attributed to your department?`)) return;
    const { error } = await supabase.from("driver_logs").update({
      lost_km_confirmed_at: new Date().toISOString(),
      lost_km_confirmed_by: user.id,
    } as any).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Attribution confirmed — you can now fill the trip details");
    load();
  };

  // Filters
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterVehicle, setFilterVehicle] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const filteredLogs = logs.filter((l) => {
    if (filterDept !== "all" && l.department_id !== filterDept) return false;
    if (filterVehicle !== "all" && l.vehicle_id !== filterVehicle) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const hay = `${l.start_point} ${l.destination} ${deptName(l.department_id)} ${vehicleLabel(l.vehicle_id)} ${drivers[l.user_id]?.full_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const distanceOf = (l: DriverLog) =>
    l.closing_km != null ? Number(l.closing_km) - Number(l.starting_km) : 0;

  // Statistics period
  const [statsPeriod, setStatsPeriod] = useState<"day" | "week" | "month" | "year">("week");
  const [statsWeekStart, setStatsWeekStart] = useState<string>(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [showRanking, setShowRanking] = useState(false);
  const [allocPeriod, setAllocPeriod] = useState<"week" | "month" | "year" | "all">("week");
  const [allocOpen, setAllocOpen] = useState(true);
  const [allocTripDraft, setAllocTripDraft] = useState<Record<string, string>>({});
  const [allocSaving, setAllocSaving] = useState<string | null>(null);

  const saveAllocTrip = async (logId: string) => {
    const value = (allocTripDraft[logId] ?? "").trim();
    setAllocSaving(logId);
    const { error } = await supabase
      .from("driver_logs")
      .update({ lost_km_trip_description: value.length ? value : null } as any)
      .eq("id", logId);
    setAllocSaving(null);
    if (error) { toast.error(error.message); return; }
    setLogs((prev) => prev.map((l) => l.id === logId ? { ...l, lost_km_trip_description: value.length ? value : null } : l));
    setAllocTripDraft((prev) => { const n = { ...prev }; delete n[logId]; return n; });
    toast.success("Trip description saved");
  };

  const statsRange = (() => {
    const now = new Date();
    if (statsPeriod === "day") {
      const s = new Date(now); s.setHours(0,0,0,0);
      const e = new Date(now); e.setHours(23,59,59,999);
      return { start: s, end: e, label: format(now, "PPP") };
    }
    if (statsPeriod === "week") {
      const s = parseISO(statsWeekStart);
      const e = endOfWeek(s, { weekStartsOn: 1 });
      return { start: s, end: e, label: `${format(s, "PP")} – ${format(e, "PP")}` };
    }
    if (statsPeriod === "month") {
      return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM yyyy") };
    }
    const s = new Date(now.getFullYear(), 0, 1);
    const e = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start: s, end: e, label: String(now.getFullYear()) };
  })();

  const statsLogs = filteredLogs.filter((l) => {
    try { return isWithinInterval(parseISO(l.log_date), { start: statsRange.start, end: statsRange.end }); }
    catch { return false; }
  });

  const statsDeptSpending = (() => {
    const map = new Map<string, { name: string; money: number; km: number; trips: number }>();
    statsLogs.forEach((l) => {
      const key = l.department_id ?? "none";
      const cur = map.get(key) ?? { name: deptName(l.department_id), money: 0, km: 0, trips: 0 };
      cur.money += Number(l.fuel_order_amount ?? 0);
      cur.km += distanceOf(l);
      cur.trips += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.money - a.money);
  })();

  const statsTotals = {
    departments: statsDeptSpending.length,
    km: statsLogs.reduce((s, l) => s + distanceOf(l), 0),
    money: statsLogs.reduce((s, l) => s + Number(l.fuel_order_amount ?? 0), 0),
  };

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
    let yPos = 24;
    if (filterDept !== "all") { doc.text(`Department filter: ${deptName(filterDept)}`, 14, yPos); yPos += 6; }
    if (filterVehicle !== "all") { doc.text(`Vehicle filter: ${vehicleLabel(filterVehicle)}`, 14, yPos); yPos += 6; }

    autoTable(doc, {
      startY: yPos,
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

    // Per-vehicle summary (especially useful when filtering by vehicle to trace its usage)
    const vehSummary = new Map<string, { name: string; trips: number; km: number; litres: number; money: number; depts: Set<string> }>();
    inRange.forEach((l) => {
      const key = l.vehicle_id ?? "none";
      const cur = vehSummary.get(key) ?? { name: vehicleLabel(l.vehicle_id), trips: 0, km: 0, litres: 0, money: 0, depts: new Set<string>() };
      cur.trips += 1;
      cur.km += distanceOf(l);
      cur.litres += Number(l.fuel_litres ?? 0);
      cur.money += Number(l.fuel_order_amount ?? 0);
      cur.depts.add(deptName(l.department_id));
      vehSummary.set(key, cur);
    });
    autoTable(doc, {
      head: [["Vehicle", "Trips", "Kilometers", "Fuel litres", "Fuel (KES)", "Departments that used it"]],
      body: [
        ...Array.from(vehSummary.values()).sort((a,b) => b.km - a.km).map((s) => [s.name, s.trips, s.km.toFixed(1), s.litres.toFixed(2), s.money.toLocaleString(), Array.from(s.depts).join(", ")]),
        ["TOTAL", inRange.length, totalKm.toFixed(1), totalLitres.toFixed(2), totalMoney.toLocaleString(), ""],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    // Allocated kilometers (lost km attributed to departments) within the period
    const allocInRange = logs.filter((l) => {
      if (!l.lost_km_attributed_to || l.lost_km_value == null) return false;
      const d = l.lost_km_attributed_at ? new Date(l.lost_km_attributed_at) : null;
      if (!d || isNaN(d.getTime())) return false;
      if (!isWithinInterval(d, { start, end })) return false;
      if (filterDept !== "all" && l.lost_km_attributed_to !== filterDept) return false;
      if (filterVehicle !== "all" && l.vehicle_id !== filterVehicle) return false;
      return true;
    });

    if (allocInRange.length > 0) {
      const allocSummary = new Map<string, { name: string; records: number; km: number }>();
      allocInRange.forEach((l) => {
        const key = l.lost_km_attributed_to as string;
        const cur = allocSummary.get(key) ?? { name: deptName(key), records: 0, km: 0 };
        cur.records += 1;
        cur.km += Number(l.lost_km_value ?? 0);
        allocSummary.set(key, cur);
      });
      const totalAllocKm = allocInRange.reduce((s, l) => s + Number(l.lost_km_value ?? 0), 0);

      autoTable(doc, {
        head: [["Allocated Kilometers — Summary by receiving department", "", ""]],
        body: [],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [80, 80, 80] },
      });
      autoTable(doc, {
        head: [["Receiving department", "Records", "Allocated km"]],
        body: [
          ...Array.from(allocSummary.values()).sort((a, b) => b.km - a.km).map((s) => [s.name, s.records, s.km.toFixed(1)]),
          ["TOTAL", allocInRange.length, totalAllocKm.toFixed(1)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [40, 40, 40] },
      });

      autoTable(doc, {
        head: [["Date allocated", "Allocated to (dept)", "Source dept", "Vehicle", "Trip", "Log date", "Allocated km"]],
        body: allocInRange
          .slice()
          .sort((a, b) => (b.lost_km_attributed_at ?? "").localeCompare(a.lost_km_attributed_at ?? ""))
          .map((l) => [
            l.lost_km_attributed_at ? format(new Date(l.lost_km_attributed_at), "yyyy-MM-dd") : "—",
            deptName(l.lost_km_attributed_to ?? null),
            deptName(l.department_id),
            vehicleLabel(l.vehicle_id),
            (l.lost_km_trip_description && l.lost_km_trip_description.trim().length > 0) ? l.lost_km_trip_description : "NOT SPECIFIED",
            format(parseISO(l.log_date), "yyyy-MM-dd"),
            Number(l.lost_km_value ?? 0).toFixed(1),
          ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [40, 40, 40] },
      });
    }

    doc.save(`drivers-log-${period}-${format(now, "yyyy-MM-dd")}.pdf`);
  };

  const downloadRankingPdf = () => {
    if (statsDeptSpending.length === 0) { toast.error("No data for the selected period"); return; }
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Departmental fuel spending ranking", 14, 16);
    doc.setFontSize(10);
    doc.text(`Period: ${statsPeriod.charAt(0).toUpperCase() + statsPeriod.slice(1)} — ${statsRange.label}`, 14, 22);
    if (filterDept !== "all") doc.text(`Department filter: ${deptName(filterDept)}`, 14, 28);
    const headerY = filterDept !== "all" ? 32 : 26;
    doc.text(`Departments: ${statsTotals.departments}  ·  Total KM: ${statsTotals.km.toFixed(1)}  ·  Total KES: ${statsTotals.money.toLocaleString()}`, 14, headerY);

    autoTable(doc, {
      startY: headerY + 4,
      head: [["Rank", "Department", "Fuel (KES)", "Kilometers", "Trips"]],
      body: [
        ...statsDeptSpending.map((s, i) => [String(i + 1), s.name, s.money.toLocaleString(), s.km.toFixed(1), String(s.trips)]),
        ["", "TOTAL", statsTotals.money.toLocaleString(), statsTotals.km.toFixed(1), String(statsLogs.length)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    doc.save(`fuel-spending-ranking-${statsPeriod}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Drivers Log</h1>
        <p className="text-sm text-muted-foreground">Vehicle journey logbook. Drivers (and Super Admins) submit entries; everyone can view. The HOD of the selected department approves.</p>
        {!rolesLoaded && (
          <p className="mt-2 text-xs text-muted-foreground">Loading your permissions…</p>
        )}
        {rolesLoaded && !isDriver && !isSuperAdmin && !isAdministrator && (
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

      {(isSuperAdmin || isAdministrator) && (() => {
        const today = format(new Date(), "yyyy-MM-dd");
        const active = logs.filter((l) => l.log_date === today && l.closing_km == null && l.status !== "rejected");
        return (
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2"><Truck className="h-5 w-5" />Vehicles currently out</CardTitle>
              <CardDescription>Live status for today. Auto-clears at the start of the next day. A vehicle stays active until the HOD closes the trip.</CardDescription>
            </CardHeader>
            <CardContent>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vehicles currently out.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border">
                  {active.map((l) => {
                    const v = vehicles.find((x) => x.id === l.vehicle_id);
                    const d = depts.find((x) => x.id === l.department_id);
                    return (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono font-semibold">{v?.registration ?? "—"}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>{d?.name ?? "—"}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>Driver: <span className="font-medium">{drivers[l.user_id]?.full_name ?? "—"}</span></span>
                          <span className="text-muted-foreground">·</span>
                          <span>{l.start_point} → {l.destination}</span>
                        </div>
                        <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
            <div>
              <Label className="text-xs">Filter by vehicle</Label>
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vehicles</SelectItem>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.registration}{v.make_model ? ` — ${v.make_model}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 md:col-span-1">
              <Button size="sm" variant="outline" onClick={() => downloadPdf("daily")}><Download className="mr-1 h-4 w-4" />Daily</Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf("weekly")}><Download className="mr-1 h-4 w-4" />Weekly</Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf("monthly")}><Download className="mr-1 h-4 w-4" />Monthly</Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Vehicle usage statistics</p>
                <p className="text-xs text-muted-foreground">{statsRange.label}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Period</Label>
                  <Select value={statsPeriod} onValueChange={(v) => setStatsPeriod(v as any)}>
                    <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="year">Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {statsPeriod === "week" && (
                  <div>
                    <Label className="text-xs">Week starting (Mon)</Label>
                    <Input type="date" className="h-9" value={statsWeekStart} onChange={(e) => setStatsWeekStart(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">No. of departments</p>
                <p className="font-serif text-2xl">{statsTotals.departments}</p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">Total kilometers covered</p>
                <p className="font-serif text-2xl">{statsTotals.km.toFixed(1)} km</p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">Total money spent (KES)</p>
                <p className="font-serif text-2xl">{statsTotals.money.toLocaleString()}</p>
              </div>
            </div>
            {statsDeptSpending.length > 0 && (
              <div className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setShowRanking((v) => !v)} className="flex flex-1 items-center justify-between gap-3 text-left">
                    <span className="text-xs font-medium uppercase text-muted-foreground">Departmental fuel spending</span>
                    <span className="text-xs text-primary">{showRanking ? "Hide full ranking" : "Show full ranking"}</span>
                  </button>
                  <Button size="sm" variant="outline" onClick={downloadRankingPdf}>
                    <Download className="mr-1 h-4 w-4" /> Download ranking PDF
                  </Button>
                </div>
                {!showRanking ? (
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Highest spender</span>
                      <span className="font-medium">{statsDeptSpending[0].name} · KES {statsDeptSpending[0].money.toLocaleString()}</span>
                    </div>
                    {statsDeptSpending.length > 1 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Lowest spender</span>
                        <span className="font-medium">{statsDeptSpending[statsDeptSpending.length - 1].name} · KES {statsDeptSpending[statsDeptSpending.length - 1].money.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <ol className="mt-2 space-y-1 text-sm">
                    {statsDeptSpending.map((s, i) => (
                      <li key={s.name} className="flex justify-between gap-3 border-b border-border/50 py-1 last:border-0">
                        <span><span className="text-muted-foreground">{i + 1}.</span> {s.name}</span>
                        <span className="text-muted-foreground">KES {s.money.toLocaleString()} · {s.km.toFixed(1)} km · {s.trips} trip{s.trips === 1 ? "" : "s"}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>

          {filteredLogs.length === 0 && <p className="text-sm text-muted-foreground">No logs match the current filter.</p>}

          {(() => {
            const isArchived = (l: DriverLog) => l.status === "approved" && l.closing_km != null;
            const openLogs = filteredLogs.filter((l) => !isArchived(l));
            const archivedLogs = filteredLogs.filter(isArchived);

            const renderLog = (l: DriverLog) => (
              <div className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{l.start_point} → {l.destination}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {format(new Date(l.log_date), "PPP")} · Driver: {drivers[l.user_id]?.full_name ?? "—"} · Dept: {deptName(l.department_id)} · Vehicle: {vehicleLabel(l.vehicle_id)}
                    </p>
                </div>
                {canViewLost(l) && (() => {
                  const last = lastDeptForVehicle(l);
                  return (
                    <p className="mt-2 text-xs">
                      <span className="font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Last Department:</span>{" "}
                      <span className="font-bold text-green-600 dark:text-green-400">{last ?? "— (first trip for this vehicle)"}</span>
                    </p>
                  );
                })()}
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
                    {canViewLost(l) && (() => {
                      const { value, baseline, firstTrip } = computedLostKm(l);
                      return (
                        <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-700/40 dark:bg-amber-950/30">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                                <AlertTriangle className="h-3.5 w-3.5" /> Lost Kilometers
                              </p>
                              <p className="mt-1 text-sm">
                                <span className="font-semibold">{value.toFixed(1)} km</span>
                                <span className="text-muted-foreground"> · Last closing: {baseline != null ? baseline.toFixed(1) : "—"} → Start: {Number(l.starting_km).toFixed(1)}</span>
                                {firstTrip && <span className="ml-1 text-xs text-muted-foreground">(first trip for this vehicle — no baseline)</span>}
                              </p>
                              {l.lost_km_attributed_to && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Attributed to <span className="font-medium text-foreground">{deptName(l.lost_km_attributed_to)}</span>
                                  {l.lost_km_attributed_at && <> · {format(new Date(l.lost_km_attributed_at), "PP p")}</>}
                                  {l.lost_km_value != null && <> · {Number(l.lost_km_value).toFixed(1)} km recorded</>}
                                </p>
                              )}
                            </div>
                            <div className="min-w-[220px]">
                              <Label className="text-xs">Attribute lost kilometers to</Label>
                              <div className="flex gap-1">
                                <Select
                                  value={l.lost_km_attributed_to ?? "__none"}
                                  onValueChange={(v) => canAttributeLost(l) && saveLostAttribution(l, v === "__none" ? null : v)}
                                  disabled={!canAttributeLost(l)}
                                >
                                  <SelectTrigger className="h-9"><SelectValue placeholder="Select department" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none">— Not attributed —</SelectItem>
                                    {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              {!canAttributeLost(l) && (
                                <p className="mt-1 text-[10px] text-muted-foreground">Only the department's HOD or a Super Admin can attribute.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(isSuperAdmin || isAdministrator || (isHod && l.department_id === myDeptId)) && (
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
                      {isProtectedSuperAdmin && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteLog(l.id)}>
                          <Trash2 className="mr-1 h-4 w-4" /> Delete log
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );

            const showAllocTab = isSuperAdmin || isAdministrator || isHod;
            const now = new Date();
            const periodInterval = allocPeriod === "week"
              ? { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
              : allocPeriod === "month"
                ? { start: startOfMonth(now), end: endOfMonth(now) }
                : allocPeriod === "year"
                  ? { start: startOfYear(now), end: endOfYear(now) }
                  : null;
            const periodLabel = allocPeriod === "week"
              ? `this week (${format(startOfWeek(now, { weekStartsOn: 1 }), "PP")} – ${format(endOfWeek(now, { weekStartsOn: 1 }), "PP")})`
              : allocPeriod === "month"
                ? `this month (${format(now, "MMMM yyyy")})`
                : allocPeriod === "year"
                  ? `this year (${format(now, "yyyy")})`
                  : "all time";
            const allocated = logs.filter((l) => {
              if (!l.lost_km_attributed_to) return false;
              if (!periodInterval) return true;
              const d = l.lost_km_attributed_at ? new Date(l.lost_km_attributed_at) : null;
              if (!d || isNaN(d.getTime())) return false;
              return isWithinInterval(d, periodInterval);
            });
            const allocByDept = (() => {
              const m = new Map<string, DriverLog[]>();
              for (const l of allocated) {
                const k = l.lost_km_attributed_to as string;
                const arr = m.get(k) ?? [];
                arr.push(l);
                m.set(k, arr);
              }
              return Array.from(m.entries()).map(([deptId, items]) => ({
                deptId,
                name: deptName(deptId),
                items: items.sort((a, b) => (b.lost_km_attributed_at ?? "").localeCompare(a.lost_km_attributed_at ?? "")),
                total: items.reduce((s, x) => s + Number(x.lost_km_value ?? 0), 0),
              })).sort((a, b) => b.total - a.total);
            })();
            const visibleAlloc = isHod && !isSuperAdmin && !isAdministrator
              ? allocByDept.filter((g) => g.deptId === myDeptId)
              : allocByDept;
            const totalAllocCount = visibleAlloc.reduce((s, g) => s + g.items.length, 0);
            const totalAllocKm = visibleAlloc.reduce((s, g) => s + g.total, 0);

            const logsView = (
              <div className="space-y-4">
                {openLogs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open trips (pending approval or awaiting closing details)</h3>
                    {openLogs.map((l) => <div key={l.id}>{renderLog(l)}</div>)}
                  </div>
                )}
                {archivedLogs.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed trips archive</h3>
                    <WeeklyArchiveGroups logs={archivedLogs} renderLog={renderLog} />
                  </div>
                )}
              </div>
            );

            if (!showAllocTab) return logsView;

            return (
              <Tabs defaultValue="logs">
                <TabsList>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="alloc">Allocated Kilometers{totalAllocCount ? ` (${totalAllocCount})` : ""}</TabsTrigger>
                </TabsList>
                <TabsContent value="logs" className="mt-4">{logsView}</TabsContent>
                <TabsContent value="alloc" className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs uppercase text-muted-foreground">Show allocations for</Label>
                    <Select value={allocPeriod} onValueChange={(v) => setAllocPeriod(v as any)}>
                      <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">This week</SelectItem>
                        <SelectItem value="month">This month</SelectItem>
                        <SelectItem value="year">This year</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => setAllocOpen((o) => !o)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize">Allocated {periodLabel}</p>
                        <p className="text-xs text-muted-foreground">{totalAllocCount} record{totalAllocCount === 1 ? "" : "s"} · {totalAllocKm.toFixed(1)} km across {visibleAlloc.length} department{visibleAlloc.length === 1 ? "" : "s"}</p>
                      </div>
                      {allocOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {allocOpen && (
                      <div className="border-t border-border p-3">
                        {visibleAlloc.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No lost kilometers have been allocated for this period.</p>
                        ) : (
                          <div className="space-y-4">
                            {visibleAlloc.map((g) => (
                              <div key={g.deptId} className="rounded-md border border-border">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
                                  <div>
                                    <p className="font-medium">{g.name}</p>
                                    <p className="text-xs text-muted-foreground">Kilometers allocated: <span className="font-semibold text-foreground">{g.total.toFixed(1)} km</span> · {g.items.length} record{g.items.length === 1 ? "" : "s"}</p>
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                                      <tr>
                                        <th className="px-3 py-2 text-left">Date allocated</th>
                                        <th className="px-3 py-2 text-left">Allocated by (source dept)</th>
                                        <th className="px-3 py-2 text-left">Vehicle</th>
                                        <th className="px-3 py-2 text-left">Trip that used these kilometers</th>
                                        <th className="px-3 py-2 text-right">Lost km</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {g.items.map((l) => {
                                        const canEditDesc = isSuperAdmin || isAdministrator || (isHod && l.lost_km_attributed_to === myDeptId);
                                        const draftKey = l.id;
                                        const draftVal = allocTripDraft[draftKey];
                                        const currentVal = l.lost_km_trip_description ?? "";
                                        const editing = draftVal !== undefined;
                                        return (
                                          <tr key={l.id} className="border-t border-border align-top">
                                            <td className="px-3 py-2 whitespace-nowrap">{l.lost_km_attributed_at ? format(new Date(l.lost_km_attributed_at), "PP") : "—"}</td>
                                            <td className="px-3 py-2">{deptName(l.department_id)}</td>
                                            <td className="px-3 py-2">{vehicleLabel(l.vehicle_id)}</td>
                                            <td className="px-3 py-2 min-w-[260px]">
                                              {canEditDesc ? (
                                                <div className="flex flex-col gap-2">
                                                  <Input
                                                    value={editing ? draftVal : currentVal}
                                                    placeholder="Describe the trip (e.g. Office → Karatina visit)"
                                                    onChange={(e) => setAllocTripDraft((prev) => ({ ...prev, [draftKey]: e.target.value }))}
                                                    className="h-9 w-full text-xs"
                                                  />
                                                  <div className="flex justify-end">
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      disabled={allocSaving === l.id || (!editing && currentVal.length === 0)}
                                                      onClick={() => saveAllocTrip(l.id)}
                                                    >
                                                      <Save className="mr-1 h-3 w-3" /> Save
                                                    </Button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <span className={currentVal ? "" : "text-xs text-muted-foreground"}>
                                                  {currentVal || "Not specified"}
                                                </span>
                                              )}
                                            </td>

                                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{Number(l.lost_km_value ?? 0).toFixed(1)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            );
          })()}

        </CardContent>
      </Card>
    </div>
  );
}

function WeeklyArchiveGroups({ logs, renderLog }: { logs: DriverLog[]; renderLog: (l: DriverLog) => React.ReactNode }) {
  const groups = (() => {
    const map = new Map<string, { start: Date; end: Date; items: DriverLog[] }>();
    for (const l of logs) {
      const ref = l.approved_at ? parseISO(l.approved_at) : (l.log_date ? parseISO(l.log_date) : null);
      if (!ref || isNaN(ref.getTime())) continue;
      const ws = startOfWeek(ref, { weekStartsOn: 1 });
      const we = endOfWeek(ref, { weekStartsOn: 1 });
      const key = format(ws, "yyyy-MM-dd");
      const g = map.get(key) ?? { start: ws, end: we, items: [] };
      g.items.push(l);
      map.set(key, g);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, g]) => ({ key, ...g }));
  })();

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <WeekGroup
          key={g.key}
          label={`Week of ${format(g.start, "MMM d")} – ${format(g.end, "MMM d, yyyy")}`}
          count={g.items.length}
        >
          {g.items.map((l) => <div key={l.id}>{renderLog(l)}</div>)}
        </WeekGroup>
      ))}
    </div>
  );
}

function WeekGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {count} approved {count === 1 ? "trip" : "trips"}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && <div className="space-y-3 border-t border-border p-3">{children}</div>}
    </div>
  );
}

