import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { FileBarChart, Plus, Pencil, Trash2, Download, Users } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/department")({
  component: DepartmentPage,
});

interface RosterRow {
  id: string;
  department_id: string;
  full_name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
}

function DepartmentPage() {
  const { profile, isSuperAdmin, isHod } = useAuth();
  const [deptId, setDeptId] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string>("");
  const [staff, setStaff] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [editRoster, setEditRoster] = useState<RosterRow | null>(null);
  const [creatingRoster, setCreatingRoster] = useState(false);

  const canManageRoster = isSuperAdmin || isHod;

  const loadRoster = async (id: string) => {
    const { data } = await (supabase as any)
      .from("department_staff")
      .select("*")
      .eq("department_id", id)
      .order("full_name");
    setRoster((data as RosterRow[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const id = profile.department_id;
      if (!id) return;
      setDeptId(id);
      const [{ data: dept }, { data: members }, { data: weekPlans }, { data: recentLogs }, { data: deptTrips }, { data: fleet }] = await Promise.all([
        supabase.from("departments").select("name").eq("id", id).maybeSingle(),
        supabase.from("profiles").select("id,full_name,email,position").eq("department_id", id),
        supabase.from("work_plans").select("id,user_id,week_start_date,status,submitted_at").eq("department_id", id).order("week_start_date", { ascending: false }).limit(20),
        supabase.from("daily_logs").select("id,user_id,log_date,achievements,challenges").eq("department_id", id).order("log_date", { ascending: false }).limit(15),
        supabase.from("driver_logs").select("id,user_id,log_date,start_point,destination,starting_km,closing_km,passengers,status,vehicle_id").eq("department_id", id).order("log_date", { ascending: false }).limit(50),
        supabase.from("vehicles").select("id,registration,make_model"),
      ]);
      setDeptName((dept as any)?.name ?? "");
      setStaff((members as any) ?? []);
      setPlans((weekPlans as any) ?? []);
      setLogs((recentLogs as any) ?? []);
      setTrips((deptTrips as any) ?? []);
      setVehicles((fleet as any) ?? []);
      loadRoster(id);
    })();
  }, [profile]);

  const saveRoster = async () => {
    if (!editRoster || !deptId) return;
    const payload = {
      department_id: deptId,
      full_name: editRoster.full_name.trim(),
      title: editRoster.title?.trim() || null,
      phone: editRoster.phone?.trim() || null,
      email: editRoster.email?.trim() || null,
    };
    if (!payload.full_name) { toast.error("Name is required"); return; }
    const client: any = supabase;
    const { error } = creatingRoster
      ? await client.from("department_staff").insert(payload)
      : await client.from("department_staff").update(payload).eq("id", editRoster.id);
    if (error) { toast.error(error.message); return; }
    toast.success(creatingRoster ? "Staff added" : "Updated");
    setEditRoster(null);
    setCreatingRoster(false);
    loadRoster(deptId);
  };

  const removeRoster = async (id: string) => {
    if (!confirm("Remove this staff entry?")) return;
    const { error } = await (supabase as any).from("department_staff").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    if (deptId) loadRoster(deptId);
  };

  const startNewRoster = () => {
    setCreatingRoster(true);
    setEditRoster({ id: "", department_id: deptId ?? "", full_name: "", title: "", phone: "", email: "" });
  };

  const downloadRosterPDF = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(102, 0, 0);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 248, 220);
    doc.setFont("times", "bold"); doc.setFontSize(18);
    doc.text("Catholic Diocese of Kitale", 14, 14);
    doc.setFont("times", "normal"); doc.setFontSize(11);
    doc.text(`${deptName || "Department"} — Staff Roster`, 14, 22);

    doc.setTextColor(40, 30, 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPp")}`, 14, 36);
    doc.text(`Total staff: ${roster.length}`, 14, 42);

    autoTable(doc, {
      startY: 48,
      head: [["#", "Name", "Title", "Phone", "Email"]],
      body: roster.map((r, i) => [
        String(i + 1),
        r.full_name,
        r.title ?? "—",
        r.phone ?? "—",
        r.email ?? "—",
      ]),
      styles: { fontSize: 9, cellPadding: 3, valign: "top", overflow: "linebreak" },
      headStyles: { fillColor: [102, 0, 0], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 50, fontStyle: "bold" },
        2: { cellWidth: 45 },
        3: { cellWidth: 35 },
        4: { cellWidth: "auto" },
      },
      margin: { left: 14, right: 14 },
    });

    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`${deptName || "Department"} Staff Roster — Page ${i} of ${pages}`,
        pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    }

    doc.save(`Staff_Roster_${(deptName || "department").replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };


  const nameFor = (uid: string) => staff.find((s) => s.id === uid)?.full_name ?? "—";
  const vehicleLabel = (vid: string | null) => {
    if (!vid) return "—";
    const v = vehicles.find((x) => x.id === vid);
    if (!v) return "—";
    return v.make_model ? `${v.registration} · ${v.make_model}` : v.registration;
  };
  const distance = (t: any) => (t.closing_km != null && t.starting_km != null ? Number(t.closing_km) - Number(t.starting_km) : null);

  const myTripCount = trips.filter((t) => t.user_id === profile?.id).length;
  const myDistance = trips
    .filter((t) => t.user_id === profile?.id)
    .reduce((sum, t) => sum + (distance(t) ?? 0), 0);
  const totalDeptDistance = trips.reduce((sum, t) => sum + (distance(t) ?? 0), 0);
  const tripsByStaff = staff
    .map((s) => {
      const userTrips = trips.filter((t) => t.user_id === s.id);
      const dist = userTrips.reduce((sum, t) => sum + (distance(t) ?? 0), 0);
      return { ...s, tripCount: userTrips.length, distance: dist };
    })
    .filter((s) => s.tripCount > 0)
    .sort((a, b) => b.tripCount - a.tripCount);

  if (!profile) return <p className="text-muted-foreground">Loading…</p>;
  if (!deptId) return <p className="text-muted-foreground">You haven't been assigned to a department yet.</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">{deptName || "My Department"}</h1>
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
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif flex items-center gap-2">
                <Users className="h-5 w-5" /> Department Staff Roster ({roster.length})
              </CardTitle>
              <CardDescription>Maintained by the Head of Department. Includes names, titles, phones and emails.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {(canManageRoster || isSuperAdmin) && roster.length > 0 && (
                <Button size="sm" variant="outline" onClick={downloadRosterPDF}>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
              )}
              {canManageRoster && (
                <Button size="sm" onClick={startNewRoster}>
                  <Plus className="mr-2 h-4 w-4" /> Add staff
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff listed yet.{canManageRoster ? " Use “Add staff” to start your roster." : ""}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-10">#</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Phone</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    {canManageRoster && <th className="px-3 py-2 text-right font-medium w-24">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={r.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.full_name}</td>
                      <td className="px-3 py-2">{r.title ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">
                        {r.phone ? <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.email ? <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a> : <span className="text-muted-foreground">—</span>}
                      </td>
                      {canManageRoster && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setCreatingRoster(false); setEditRoster(r); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => removeRoster(r.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editRoster} onOpenChange={(o) => { if (!o) { setEditRoster(null); setCreatingRoster(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{creatingRoster ? "Add staff member" : "Edit staff member"}</DialogTitle></DialogHeader>
          {editRoster && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Full name *</Label>
                <Input value={editRoster.full_name} onChange={(e) => setEditRoster({ ...editRoster, full_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Title / Position</Label>
                <Input value={editRoster.title ?? ""} onChange={(e) => setEditRoster({ ...editRoster, title: e.target.value })} placeholder="e.g. Programs Officer" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={editRoster.phone ?? ""} onChange={(e) => setEditRoster({ ...editRoster, phone: e.target.value })} placeholder="e.g. +254 712 345 678" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={editRoster.email ?? ""} onChange={(e) => setEditRoster({ ...editRoster, email: e.target.value })} placeholder="name@example.org" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditRoster(null); setCreatingRoster(false); }}>Cancel</Button>
            <Button onClick={saveRoster}>{creatingRoster ? "Add" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Vehicle trips</CardTitle>
          <CardDescription>Driver logs filed by department members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">My trips</p>
              <p className="text-2xl font-semibold">{myTripCount}</p>
              <p className="text-xs text-muted-foreground">{myDistance.toLocaleString()} km covered</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Department trips</p>
              <p className="text-2xl font-semibold">{trips.length}</p>
              <p className="text-xs text-muted-foreground">{totalDeptDistance.toLocaleString()} km covered</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Active drivers</p>
              <p className="text-2xl font-semibold">{tripsByStaff.length}</p>
              <p className="text-xs text-muted-foreground">staff with trips</p>
            </div>
          </div>

          {tripsByStaff.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Trips per staff</p>
              <ul className="divide-y divide-border">
                {tripsByStaff.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">{s.position ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{s.tripCount} trip{s.tripCount === 1 ? "" : "s"}</p>
                      <p className="text-xs text-muted-foreground">{s.distance.toLocaleString()} km</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold">Recent trips</p>
            {trips.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trips logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {trips.slice(0, 15).map((t) => {
                  const d = distance(t);
                  return (
                    <li key={t.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{nameFor(t.user_id)} — {format(parseISO(t.log_date), "MMM d, yyyy")}</p>
                          <p className="text-xs text-muted-foreground break-words">{t.start_point} → {t.destination}</p>
                          <p className="text-xs text-muted-foreground break-words">{vehicleLabel(t.vehicle_id)}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={t.status === "approved" ? "default" : "outline"} className={t.status === "approved" ? "bg-success text-success-foreground" : ""}>{t.status}</Badge>
                          <p className="mt-1 text-xs text-muted-foreground">{d != null ? `${d.toLocaleString()} km` : "—"} · {t.passengers ?? 0} pax</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Link to="/reports"><Button variant="outline"><FileBarChart className="mr-2 h-4 w-4" /> Generate monthly report for a staff member</Button></Link>
    </div>
  );
}
