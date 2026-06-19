import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateUser, adminDeleteUser, adminUpdateUser } from "@/lib/admin-users.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Plus, ShieldCheck, ShieldOff, Check, X, Trash2, UserPlus, Copy, Pencil, ChevronDown, ChevronUp, Download } from "lucide-react";
import { downloadVehicleRequestPDF, downloadWeeklyVehicleRequestPDF } from "@/lib/vehicle-request-pdf";
import { downloadWorkPlanPDF } from "@/lib/work-plan-pdf";
import { AttendanceLogPanel } from "@/components/AttendanceLogPanel";
import { TimeGroupedList } from "@/components/TimeGroupedList";

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: AdminPage,
});

type Role = "super_admin" | "administrator" | "hod" | "staff" | "driver";

function AdminPage() {
  const { isSuperAdmin, isAdministrator, user } = useAuth();
  const canEdit = isSuperAdmin;
  const canAccess = isSuperAdmin || isAdministrator;
  const search = useSearch({ from: "/_authenticated/admin" }) as { tab?: string };
  const navigate = useNavigate();
  const tab = search.tab ?? "vehicles";
  const createUserFn = useServerFn(adminCreateUser);
  const deleteUserFn = useServerFn(adminDeleteUser);
  const updateUserFn = useServerFn(adminUpdateUser);
  const [editUser, setEditUser] = useState<{ id: string; full_name: string; email: string; password: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [depts, setDepts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, Role[]>>({});
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [newVehicle, setNewVehicle] = useState({ registration: "", make_model: "", notes: "" });
  const [newDept, setNewDept] = useState({ name: "", description: "" });
  const [events, setEvents] = useState<any[]>([]);
  const [newEvent, setNewEvent] = useState({ title: "", event_date: "", department_id: "none", venue: "", notes: "" });

  // Create user state
  const [nu, setNu] = useState<{ email: string; password: string; fullName: string; departmentId: string; position: string; roles: Role[] }>(
    { email: "", password: "", fullName: "", departmentId: "none", position: "", roles: ["staff"] }
  );
  const [creating, setCreating] = useState(false);

  // Logs & plans state
  const [logs, setLogs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  const load = async () => {
    const [{ data: d }, { data: u }, { data: r }, { data: v }, { data: f }, { data: l }, { data: p }, { data: ev }] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("profiles").select("id,full_name,email,position,department_id").order("full_name"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("vehicle_requests").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("vehicles").select("*").order("registration"),
      supabase.from("daily_logs").select("*").order("log_date", { ascending: false }).limit(100),
      supabase.from("work_plans").select("*").order("submitted_at", { ascending: false, nullsFirst: false }).limit(100),
      supabase.from("diocesan_events").select("*").order("event_date", { ascending: true }),
    ]);
    setDepts((d as any) ?? []);
    setUsers((u as any) ?? []);
    const map: Record<string, Role[]> = {};
    ((r as any[]) ?? []).forEach((row) => { (map[row.user_id] ||= []).push(row.role); });
    setRolesByUser(map);
    setVehicles((v as any) ?? []);
    setFleet((f as any) ?? []);
    setLogs((l as any) ?? []);
    setPlans((p as any) ?? []);
    setEvents((ev as any) ?? []);
  };
  useEffect(() => { if (canAccess) load(); }, [canAccess]);

  if (!canAccess) return <p className="text-muted-foreground">Access denied.</p>;

  const addDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDept.name.trim()) return;
    const { error } = await supabase.from("departments").insert(newDept);
    if (error) toast.error(error.message);
    else { toast.success("Department created"); setNewDept({ name: "", description: "" }); load(); }
  };

  const addVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicle.registration.trim()) return;
    const { error } = await supabase.from("vehicles").insert({
      registration: newVehicle.registration.trim(),
      make_model: newVehicle.make_model.trim() || null,
      notes: newVehicle.notes.trim() || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Vehicle added"); setNewVehicle({ registration: "", make_model: "", notes: "" }); load(); }
  };

  const toggleVehicleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("vehicles").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const removeVehicle = async (id: string) => {
    if (!window.confirm("Delete this vehicle from the fleet?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Removed"); load(); }
  };

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.event_date) return;
    const { error } = await supabase.from("diocesan_events").insert({
      title: newEvent.title.trim(),
      event_date: newEvent.event_date,
      department_id: newEvent.department_id === "none" ? null : newEvent.department_id,
      venue: newEvent.venue.trim() || null,
      notes: newEvent.notes.trim() || null,
      created_by: user?.id ?? null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Event added"); setNewEvent({ title: "", event_date: "", department_id: "none", venue: "", notes: "" }); load(); }
  };

  const removeEvent = async (id: string) => {
    if (!window.confirm("Delete this event?")) return;
    const { error } = await supabase.from("diocesan_events").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Removed"); load(); }
  };

  const setHod = async (deptId: string, userId: string | null) => {
    await supabase.from("departments").update({ hod_id: userId }).eq("id", deptId);
    if (userId) {
      const has = (rolesByUser[userId] ?? []).includes("hod");
      if (!has) await supabase.from("user_roles").insert({ user_id: userId, role: "hod" });
    }
    toast.success("Updated");
    load();
  };

  const assignDepartment = async (userId: string, deptId: string | null) => {
    const { error } = await supabase.from("profiles").update({ department_id: deptId }).eq("id", userId);
    if (error) toast.error(error.message); else { toast.success("Updated"); load(); }
  };

  const toggleRole = async (userId: string, role: Role) => {
    const has = (rolesByUser[userId] ?? []).includes(role);
    if (has) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    } else {
      await supabase.from("user_roles").insert({ user_id: userId, role });
    }
    toast.success("Role updated");
    load();
  };

  const decideVehicle = async (id: string, status: "approved" | "rejected", notes?: string) => {
    await supabase.from("vehicle_requests").update({
      status, approver_notes: notes ?? null, approved_at: new Date().toISOString(),
    }).eq("id", id);
    toast.success(`Vehicle request ${status}`);
    load();
  };

  const decideVehicleBulk = async (ids: string[], status: "approved" | "rejected", notes?: string) => {
    if (ids.length === 0) return;
    const { error } = await supabase.from("vehicle_requests").update({
      status, approver_notes: notes ?? null, approved_at: new Date().toISOString(),
    }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} request${ids.length > 1 ? "s" : ""} ${status}`); load(); }
  };

  const deleteVehicle = async (id: string) => {
    if (!confirm("Delete this vehicle request? This cannot be undone.")) return;
    const { error } = await supabase.from("vehicle_requests").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Vehicle request deleted"); load(); }
  };

  const updateVehicle = async (id: string, patch: Record<string, any>) => {
    const { error } = await (supabase.from("vehicle_requests") as any).update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Vehicle request updated"); load(); }
  };

  const genPassword = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setNu((s) => ({ ...s, password: out }));
  };

  const copyCreds = () => {
    const txt = `Email: ${nu.email}\nTemporary password: ${nu.password}`;
    navigator.clipboard.writeText(txt);
    toast.success("Credentials copied to clipboard");
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nu.email || !nu.fullName || nu.password.length < 8 || nu.roles.length === 0) {
      toast.error("Email, name, role and password (8+ chars) are required");
      return;
    }
    setCreating(true);
    try {
      await createUserFn({ data: {
        email: nu.email.trim(),
        password: nu.password,
        fullName: nu.fullName.trim(),
        departmentId: nu.departmentId === "none" ? null : nu.departmentId,
        position: nu.position.trim() || null,
        roles: nu.roles,
      }});
      toast.success(`User created. Share temp password: ${nu.password}`);
      copyCreds();
      setNu({ email: "", password: "", fullName: "", departmentId: "none", position: "", roles: ["staff"] });
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create user");
    }
    setCreating(false);
  };

  const toggleNewRole = (r: Role) => {
    setNu((s) => ({ ...s, roles: s.roles.includes(r) ? s.roles.filter((x) => x !== r) : [...s.roles, r] }));
  };

  const deleteLog = async (id: string) => {
    if (!confirm("Delete this daily log? This cannot be undone.")) return;
    const { error } = await supabase.from("daily_logs").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Log deleted"); load(); }
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Delete this work plan and all its activities? This cannot be undone.")) return;
    await supabase.from("work_plan_items").delete().eq("work_plan_id", id);
    const { error } = await supabase.from("work_plans").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Work plan deleted"); load(); }
  };

  const deleteUser = async (id: string, name: string) => {
    if (id === user?.id) { toast.error("You cannot delete your own account"); return; }
    if (!confirm(`Permanently delete ${name}? This removes their login and cannot be undone.`)) return;
    try {
      await deleteUserFn({ data: { userId: id } });
      toast.success("User deleted");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete user");
    }
  };

  const userName = (id: string) => users.find((u) => u.id === id)?.full_name ?? "—";
  const userMeta = (id: string) => {
    const u = users.find((x) => x.id === id);
    const dept = u?.department_id ? depts.find((d: any) => d.id === u.department_id) : null;
    const hod = dept?.hod_id ? users.find((x) => x.id === dept.hod_id) : null;
    return {
      fullName: u?.full_name ?? "—",
      position: u?.position ?? null,
      departmentName: dept?.name ?? null,
      hodName: hod?.full_name ?? null,
    };
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">{canEdit ? "Manage departments, users, roles, vehicle approvals, and data cleanup." : "View-only access to submitted entries for planning purposes."}</p>
      </div>
      {!canEdit && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          You are signed in as <strong>Administrator</strong>. This is a read-only view — only Super Admins can create users, approve requests, or make changes. You can still use all other staff features (work plans, vehicle requests, daily logs, leave requests) normally.
        </div>
      )}



      <Tabs value={tab} onValueChange={(v) => navigate({ to: "/admin", search: { tab: v } })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="vehicles">Vehicle approvals</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="events">Diocesan events</TabsTrigger>
          <TabsTrigger value="depts">Departments</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="allplans">Work plans</TabsTrigger>
          <TabsTrigger value="cleanup">Logs & plans</TabsTrigger>
          <TabsTrigger value="attendance">Office attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-3 pt-4">
          <AttendanceLogPanel />
        </TabsContent>

        <TabsContent value="events" className="space-y-4 pt-4">
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Add upcoming event</CardTitle>
                <CardDescription>Posted to every user's dashboard.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={addEvent} className="grid gap-3 md:grid-cols-2">
                  <div><Label>Title *</Label><Input required maxLength={200} value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Diocesan Synod" /></div>
                  <div><Label>Date *</Label><Input required type="date" value={newEvent.event_date} onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })} /></div>
                  <div>
                    <Label>Department spearheading</Label>
                    <Select value={newEvent.department_id} onValueChange={(v) => setNewEvent({ ...newEvent, department_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Venue</Label><Input maxLength={200} value={newEvent.venue} onChange={(e) => setNewEvent({ ...newEvent, venue: e.target.value })} placeholder="Cathedral grounds" /></div>
                  <div className="md:col-span-2"><Label>Notes</Label><Textarea maxLength={2000} value={newEvent.notes} onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })} placeholder="Additional details, dress code, agenda…" /></div>
                  <Button type="submit" className="md:col-span-2 w-fit"><Plus className="mr-1 h-4 w-4" />Add event</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {(() => {
            if (events.length === 0) {
              return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No events yet. {canEdit && "Add one above."}</CardContent></Card>;
            }
            const currentYear = new Date().getFullYear();
            const byYear: Record<string, any[]> = {};
            events.forEach((ev) => {
              const y = String(parseISO(ev.event_date).getFullYear());
              (byYear[y] ||= []).push(ev);
            });
            const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
            const renderEv = (ev: any) => {
              const dept = depts.find((d) => d.id === ev.department_id);
              const past = new Date(ev.event_date) < new Date(new Date().toDateString());
              return (
                <Card key={ev.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{ev.title}</p>
                        <Badge variant={past ? "secondary" : "default"}>{past ? "Past" : "Upcoming"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{format(parseISO(ev.event_date), "EEEE, MMM d, yyyy")}{dept && <> · {dept.name}</>}{ev.venue && <> · {ev.venue}</>}</p>
                      {ev.notes && <p className="mt-2 text-sm whitespace-pre-wrap break-words">{ev.notes}</p>}
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeEvent(ev.id)}>
                        <Trash2 className="mr-1 h-4 w-4" />Delete
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            };
            return years.map((y) => (
              <details key={y} open={Number(y) === currentYear} className="rounded-lg border border-border bg-card/40">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40">
                  <span>Events {y} <span className="text-muted-foreground">({byYear[y].length})</span></span>
                  <ChevronDown className="h-4 w-4" />
                </summary>
                <div className="space-y-3 p-3">
                  {byYear[y].map(renderEv)}
                </div>
              </details>
            ));
          })()}


        </TabsContent>

        <TabsContent value="fleet" className="space-y-4 pt-4">
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Add vehicle</CardTitle>
                <CardDescription>Register a vehicle drivers can select when filling the driver log.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={addVehicle} className="grid gap-3 md:grid-cols-3 md:items-end">
                  <div><Label>Registration *</Label><Input required value={newVehicle.registration} onChange={(e) => setNewVehicle({ ...newVehicle, registration: e.target.value })} placeholder="KAA 123A" /></div>
                  <div><Label>Make / model</Label><Input value={newVehicle.make_model} onChange={(e) => setNewVehicle({ ...newVehicle, make_model: e.target.value })} placeholder="Toyota Hiace" /></div>
                  <div><Label>Notes</Label><Input value={newVehicle.notes} onChange={(e) => setNewVehicle({ ...newVehicle, notes: e.target.value })} /></div>
                  <Button type="submit" className="md:col-span-3 w-fit"><Plus className="mr-1 h-4 w-4" />Add vehicle</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {fleet.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No vehicles yet. {canEdit && "Add one above."}</CardContent></Card>
          )}
          {fleet.map((vh) => (
            <Card key={vh.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{vh.registration} {vh.make_model && <span className="text-muted-foreground">· {vh.make_model}</span>}</p>
                  {vh.notes && <p className="text-xs text-muted-foreground">{vh.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={vh.active ? "default" : "secondary"}>{vh.active ? "Active" : "Inactive"}</Badge>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => toggleVehicleActive(vh.id, vh.active)}>
                        {vh.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeVehicle(vh.id)}>
                        <Trash2 className="mr-1 h-4 w-4" />Delete
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>


        <TabsContent value="vehicles" className="space-y-3 pt-4">
          {(() => {
            const pending = vehicles.filter((v) => v.status === "pending");
            if (pending.length === 0) {
              return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No pending vehicle requests.</CardContent></Card>;
            }
            // Group by user_id + week_start_date (fallback: week of date_needed)
            const groups: Record<string, any[]> = {};
            pending.forEach((v) => {
              const wk = v.week_start_date ?? v.date_needed;
              const key = `${v.user_id}__${wk}`;
              (groups[key] ||= []).push(v);
            });
            const groupList = Object.entries(groups).map(([key, items]) => ({
              key,
              items: items.sort((a, b) => a.date_needed.localeCompare(b.date_needed)),
              weekStart: items[0].week_start_date ?? items[0].date_needed,
              userId: items[0].user_id,
            })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
            return groupList.map((g) => (
              g.items.length === 1
                ? <VehicleApproveCard key={g.key} v={g.items[0]} userName={userName} userMeta={userMeta} onDecide={decideVehicle} onDelete={deleteVehicle} onUpdate={updateVehicle} canEdit={canEdit} />
                : <VehicleWeeklyApproveCard key={g.key} items={g.items} weekStart={g.weekStart} userId={g.userId} userName={userName} userMeta={userMeta} onDecideBulk={decideVehicleBulk} onDecide={decideVehicle} onDelete={deleteVehicle} onUpdate={updateVehicle} canEdit={canEdit} />
            ));
          })()}
          <h3 className="mt-6 font-serif text-lg">All recent requests</h3>
          {(() => {
            const decided = vehicles.filter((v) => v.status !== "pending");
            if (decided.length === 0) {
              return <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No past requests.</CardContent></Card>;
            }
            const groups: Record<string, any[]> = {};
            decided.forEach((v) => {
              const wk = v.week_start_date ?? v.date_needed;
              (groups[`${v.user_id}__${wk}`] ||= []).push(v);
            });
            const groupList = Object.entries(groups).map(([key, items]) => ({
              key,
              items: items.sort((a, b) => a.date_needed.localeCompare(b.date_needed)),
              weekStart: items[0].week_start_date ?? items[0].date_needed,
              userId: items[0].user_id,
            })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

            const byMonth: Record<string, typeof groupList> = {};
            groupList.forEach((g) => {
              const d = parseISO(g.weekStart);
              const monthKey = format(d, "yyyy-MM");
              (byMonth[monthKey] ||= []).push(g);
            });
            const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
            const currentMonth = format(new Date(), "yyyy-MM");
            return months.map((m) => (
              <details key={m} open={m === currentMonth} className="rounded-lg border border-border bg-card/40">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40">
                  <span>{format(parseISO(m + "-01"), "MMMM yyyy")} <span className="text-muted-foreground">({byMonth[m].reduce((n, g) => n + g.items.length, 0)} requests)</span></span>
                  <ChevronDown className="h-4 w-4" />
                </summary>
                <div className="space-y-3 p-3">
                  {byMonth[m].map((g) => (
                    g.items.length === 1
                      ? <VehicleManageCard key={g.key} v={g.items[0]} userName={userName} userMeta={userMeta} onDelete={deleteVehicle} onUpdate={updateVehicle} onDecide={decideVehicle} canEdit={canEdit} />
                      : <VehicleWeeklyManageCard key={g.key} items={g.items} weekStart={g.weekStart} userId={g.userId} userName={userName} userMeta={userMeta} onDelete={deleteVehicle} onUpdate={updateVehicle} onDecide={decideVehicle} onDecideBulk={decideVehicleBulk} canEdit={canEdit} />
                  ))}
                </div>
              </details>
            ));
          })()}

        </TabsContent>


        <TabsContent value="depts" className="space-y-4 pt-4">
          {canEdit && (
            <Card>
              <CardHeader><CardTitle className="font-serif">New department</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={addDept} className="grid gap-3 md:grid-cols-3 md:items-end">
                  <div><Label>Name</Label><Input value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>Description</Label><Input value={newDept.description} onChange={(e) => setNewDept({ ...newDept, description: e.target.value })} /></div>
                  <Button type="submit" className="md:col-span-3 w-fit"><Plus className="mr-1 h-4 w-4" />Create</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {depts.map((d) => {
            const hodUser = d.hod_id ? users.find((u) => u.id === d.hod_id) : null;
            return (
              <Card key={d.id}>
                <CardHeader>
                  <CardTitle className="font-serif">{d.name}</CardTitle>
                  {d.description && <CardDescription>{d.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <Label>Head of Department</Label>
                  {canEdit ? (
                    <Select value={d.hod_id ?? "none"} onValueChange={(v) => setHod(d.id, v === "none" ? null : v)}>
                      <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose HOD" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {users.filter((u) => u.department_id === d.id).map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{hodUser?.full_name ?? <span className="text-muted-foreground">— Not assigned —</span>}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>


        <TabsContent value="users" className="space-y-4 pt-4">
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Create user</CardTitle>
                <CardDescription>Issue temporary login credentials. The new user can sign in immediately and change their password later.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="grid gap-3 md:grid-cols-2">
                  <div><Label>Full name</Label><Input value={nu.fullName} onChange={(e) => setNu({ ...nu, fullName: e.target.value })} required /></div>
                  <div><Label>Email</Label><Input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required /></div>
                  <div>
                    <Label>Temporary password</Label>
                    <div className="flex gap-2">
                      <Input value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="Min 8 chars" />
                      <Button type="button" variant="outline" onClick={genPassword}>Generate</Button>
                    </div>
                  </div>
                  <div><Label>Position (optional)</Label><Input value={nu.position} onChange={(e) => setNu({ ...nu, position: e.target.value })} /></div>
                  <div>
                    <Label>Department</Label>
                    <Select value={nu.departmentId} onValueChange={(v) => setNu({ ...nu, departmentId: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Roles</Label>
                    <div className="flex flex-wrap gap-3 pt-2">
                      {(["staff","driver","hod","administrator","super_admin"] as Role[]).map((r) => (
                        <label key={r} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={nu.roles.includes(r)} onCheckedChange={() => toggleNewRole(r)} />
                          {r.replace("_", " ")}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2 flex gap-2">
                    <Button type="submit" disabled={creating}><UserPlus className="mr-1 h-4 w-4" />{creating ? "Creating…" : "Create user"}</Button>
                    {nu.password && nu.email && (
                      <Button type="button" variant="outline" onClick={copyCreds}><Copy className="mr-1 h-4 w-4" />Copy credentials</Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {users.map((u) => {
            const userRoles = rolesByUser[u.id] ?? [];
            const isProtected = u.id === "788b3a81-1631-4b53-a08d-35ce5d605f4e";
            const isSelf = u.id === user?.id;
            const locked = isProtected && !isSelf;
            const userDept = u.department_id ? depts.find((d) => d.id === u.department_id) : null;
            return (
              <Card key={u.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {u.full_name}
                        {isProtected && <Badge className="ml-2" variant="outline">Protected</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {userRoles.map((r) => <Badge key={r} variant="secondary">{r.replace("_", " ")}</Badge>)}
                      </div>
                      {locked && <p className="mt-2 text-xs text-muted-foreground">This account is protected and can only be edited by the owner.</p>}
                    </div>
                    {canEdit && !locked && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditUser({ id: u.id, full_name: u.full_name ?? "", email: u.email ?? "", password: "" })}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                        </Button>
                        {!isSelf && (
                          <Button size="sm" variant="destructive" onClick={() => deleteUser(u.id, u.full_name)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" />Delete user
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {canEdit ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Department</Label>
                        <Select value={u.department_id ?? "none"} onValueChange={(v) => assignDepartment(u.id, v === "none" ? null : v)} disabled={locked}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        {(["super_admin","administrator","hod","staff","driver"] as Role[]).map((r) => (
                          <Button key={r} variant={userRoles.includes(r) ? "default" : "outline"} size="sm" onClick={() => toggleRole(u.id, r)} disabled={locked}>
                            {userRoles.includes(r) ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : <ShieldOff className="mr-1 h-3.5 w-3.5" />}
                            {r.replace("_", " ")}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Department: {userDept?.name ?? "—"}{u.position ? ` · ${u.position}` : ""}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit user</DialogTitle>
                <DialogDescription>Update the user's name, email, or reset their password. Leave password blank to keep it unchanged.</DialogDescription>
              </DialogHeader>
              {editUser && (
                <div className="grid gap-3">
                  <div><Label>Full name</Label><Input value={editUser.full_name} onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })} /></div>
                  <div><Label>Email (login)</Label><Input type="email" value={editUser.email} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} /></div>
                  <div>
                    <Label>New password (optional, min 8 chars)</Label>
                    <Input type="text" value={editUser.password} onChange={(e) => setEditUser({ ...editUser, password: e.target.value })} placeholder="Leave blank to keep current" />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button
                  disabled={savingEdit}
                  onClick={async () => {
                    if (!editUser) return;
                    if (editUser.password && editUser.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
                    setSavingEdit(true);
                    try {
                      await updateUserFn({ data: {
                        userId: editUser.id,
                        fullName: editUser.full_name.trim(),
                        email: editUser.email.trim(),
                        password: editUser.password || undefined,
                      }});
                      toast.success("User updated");
                      setEditUser(null);
                      load();
                    } catch (err: any) {
                      toast.error(err?.message ?? "Failed to update user");
                    }
                    setSavingEdit(false);
                  }}
                >{savingEdit ? "Saving…" : "Save changes"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </TabsContent>

        <TabsContent value="cleanup" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Daily logs</CardTitle>
              <CardDescription>Delete a log entry submitted by mistake.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <TimeGroupedList
                items={logs}
                getDate={(l: any) => parseISO(l.log_date)}
                keyOf={(l: any) => l.id}
                groupLabel="Logs"
                emptyMessage={<p className="text-sm text-muted-foreground">No logs yet.</p>}
                renderItem={(l: any) => (
                  <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium">{userName(l.user_id)} · {format(parseISO(l.log_date), "PPP")}</p>
                      {l.achievements && <p className="text-xs text-muted-foreground"><span className="font-medium">Achievements:</span> {l.achievements}</p>}
                      {l.challenges && <p className="text-xs text-muted-foreground"><span className="font-medium">Challenges:</span> {l.challenges}</p>}
                    </div>
                    {canEdit && <Button size="sm" variant="destructive" onClick={() => deleteLog(l.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>}
                  </div>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Work plans</CardTitle>
              <CardDescription>Delete a weekly work plan (removes all its activities).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <TimeGroupedList
                items={plans}
                getDate={(p: any) => parseISO(p.week_start_date)}
                keyOf={(p: any) => p.id}
                groupLabel="Work plans"
                emptyMessage={<p className="text-sm text-muted-foreground">No work plans yet.</p>}
                renderItem={(p: any) => (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium">{userName(p.user_id)} · Week of {format(parseISO(p.week_start_date), "MMM d, yyyy")}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.status === "submitted" && (
                          <>
                            <Badge variant="secondary">SUBMITTED</Badge>
                            <Badge variant="outline" className="text-destructive border-destructive">NOT APPROVED</Badge>
                          </>
                        )}
                        {p.status === "approved" && (
                          <Badge variant="default" className="bg-success text-success-foreground">SUBMITTED & APPROVED</Badge>
                        )}
                        {p.status !== "submitted" && p.status !== "approved" && (
                          <Badge variant="outline">{p.status}</Badge>
                        )}
                      </div>
                    </div>
                    {canEdit && <Button size="sm" variant="destructive" onClick={() => deletePlan(p.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>}
                  </div>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allplans" className="space-y-3 pt-4">
          <p className="text-sm text-muted-foreground">All weekly work plans across the diocese. Click to expand and read the activities.</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-sm">Submitted: {plans.filter((p) => p.status === "submitted").length}</Badge>
            <Badge variant="default" className="bg-success text-success-foreground text-sm">Submitted & Approved: {plans.filter((p) => p.status === "approved").length}</Badge>
            <Badge variant="outline" className="text-sm text-destructive border-destructive">Not Approved: {plans.filter((p) => p.status === "submitted").length}</Badge>
          </div>
          <TimeGroupedList
            items={plans}
            getDate={(p: any) => parseISO(p.week_start_date)}
            keyOf={(p: any) => p.id}
            groupLabel="Work plans"
            emptyMessage={<Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No work plans yet.</CardContent></Card>}
            renderItem={(p: any) => (
              <WorkPlanReadCard plan={p} userName={userName} users={users} depts={depts} onChanged={load} canEdit={canEdit} />
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VehicleApproveCard({ v, userName, userMeta, onDecide, onDelete, onUpdate, canEdit = true }: { v: any; userName: (id: string) => string; userMeta: (id: string) => any; onDecide: (id: string, s: "approved" | "rejected", notes?: string) => void; onDelete: (id: string) => void; onUpdate: (id: string, patch: Record<string, any>) => void; canEdit?: boolean }) {
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ destination: v.destination, date_needed: v.date_needed, time_from: v.time_from ?? "", time_to: v.time_to ?? "", purpose: v.purpose, passengers: v.passengers ?? 1 });
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-serif text-lg">{v.destination}</p>
            <p className="text-sm text-muted-foreground">{userName(v.user_id)} · {format(parseISO(v.date_needed), "PPP")}{v.time_from ? ` · ${v.time_from}–${v.time_to ?? ""}` : ""}</p>
          </div>
          <Badge variant="outline">Pending</Badge>
        </div>
        {!editing ? (
          <>
            <p className="text-sm">{v.purpose}</p>
            <p className="text-xs text-muted-foreground">Passengers: {v.passengers ?? 1}</p>
            {canEdit && <Textarea rows={2} placeholder="Optional note to requester" value={notes} onChange={(e) => setNotes(e.target.value)} />}
            <div className="flex flex-wrap gap-2">
              {canEdit && <Button size="sm" onClick={() => onDecide(v.id, "approved", notes)}><Check className="mr-1 h-4 w-4" /> Approve</Button>}
              {canEdit && <Button size="sm" variant="destructive" onClick={() => onDecide(v.id, "rejected", notes)}><X className="mr-1 h-4 w-4" /> Reject</Button>}
              {canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>}
              <Button size="sm" variant="outline" onClick={() => downloadVehicleRequestPDF(v, userMeta(v.user_id))}><Download className="mr-1 h-3.5 w-3.5" /> PDF</Button>
              {canEdit && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(v.id)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>}
            </div>
          </>
        ) : (
          <VehicleEditFields form={form} setForm={setForm} onSave={() => { onUpdate(v.id, { ...form, time_from: form.time_from || null, time_to: form.time_to || null }); setEditing(false); }} onCancel={() => setEditing(false)} />
        )}
      </CardContent>
    </Card>
  );
}


function VehicleWeeklyApproveCard({ items, weekStart, userId, userName, userMeta, onDecideBulk, onDecide, onDelete, onUpdate, canEdit = true }: { items: any[]; weekStart: string; userId: string; userName: (id: string) => string; userMeta: (id: string) => any; onDecideBulk: (ids: string[], s: "approved" | "rejected", notes?: string) => void; onDecide: (id: string, s: "approved" | "rejected", notes?: string) => void; onDelete: (id: string) => void; onUpdate: (id: string, patch: Record<string, any>) => void; canEdit?: boolean }) {
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const meta = userMeta(userId);
  const ids = items.map((i) => i.id);
  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-serif text-lg">{userName(userId)} — weekly vehicle request</p>
            <p className="text-sm text-muted-foreground">
              {meta.departmentName ? `${meta.departmentName} · ` : ""}Week of {format(parseISO(weekStart), "MMM d, yyyy")} · {items.length} trip{items.length > 1 ? "s" : ""}
            </p>
          </div>
          <Badge variant="outline">Pending</Badge>
        </div>

        <div className="rounded-md border border-border divide-y divide-border">
          {items.map((v) => (
            <div key={v.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{format(parseISO(v.date_needed), "EEE, MMM d")}{v.time_from ? ` · ${v.time_from}–${v.time_to ?? ""}` : ""}</p>
                  <p className="text-sm">{v.destination}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{v.purpose} · Passengers: {v.passengers ?? 1}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(v.id)} title="Delete day"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {canEdit && <Textarea rows={2} placeholder="Optional note to requester (applies to all trips)" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button size="sm" onClick={() => onDecideBulk(ids, "approved", notes)}><Check className="mr-1 h-4 w-4" /> Approve all {items.length} trips</Button>}
          {canEdit && <Button size="sm" variant="destructive" onClick={() => onDecideBulk(ids, "rejected", notes)}><X className="mr-1 h-4 w-4" /> Reject all</Button>}
          <Button size="sm" variant="outline" onClick={() => downloadWeeklyVehicleRequestPDF(items, meta, weekStart)}><Download className="mr-1 h-3.5 w-3.5" /> Download weekly form</Button>
          {canEdit && <Button size="sm" variant="outline" onClick={() => setExpanded((s) => !s)}>{expanded ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}{expanded ? "Hide" : "Decide per day"}</Button>}
        </div>

        {expanded && canEdit && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">Decide individual days separately:</p>
            {items.map((v) => (
              <VehicleApproveCard key={v.id} v={v} userName={userName} userMeta={userMeta} onDecide={onDecide} onDelete={onDelete} onUpdate={onUpdate} canEdit={canEdit} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function VehicleWeeklyManageCard({ items, weekStart, userId, userName, userMeta, onDelete, onUpdate, onDecide, onDecideBulk, canEdit = true }: { items: any[]; weekStart: string; userId: string; userName: (id: string) => string; userMeta: (id: string) => any; onDelete: (id: string) => void; onUpdate: (id: string, patch: Record<string, any>) => void; onDecide: (id: string, s: "approved" | "rejected", notes?: string) => void; onDecideBulk: (ids: string[], s: "approved" | "rejected", notes?: string) => void; canEdit?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta = userMeta(userId);
  const statuses = Array.from(new Set(items.map((i) => i.status)));
  const statusLabel = statuses.length === 1 ? statuses[0] : "mixed";
  const ids = items.map((i) => i.id);
  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{userName(userId)} — weekly request</p>
            <p className="text-xs text-muted-foreground">
              {meta.departmentName ? `${meta.departmentName} · ` : ""}Week of {format(parseISO(weekStart), "MMM d, yyyy")} · {items.length} trips
            </p>
          </div>
          <Badge className={statusLabel === "approved" ? "bg-success text-success-foreground" : ""} variant={statusLabel === "rejected" ? "destructive" : "default"}>{statusLabel}</Badge>
        </div>

        <div className="rounded-md border border-border divide-y divide-border">
          {items.map((v) => (
            <div key={v.id} className="p-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{format(parseISO(v.date_needed), "EEE, MMM d")}{v.time_from ? ` · ${v.time_from}–${v.time_to ?? ""}` : ""} — {v.destination}</p>
                  <p className="text-muted-foreground">{v.purpose} · Passengers: {v.passengers ?? 1}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{v.status}</Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => downloadWeeklyVehicleRequestPDF(items, meta, weekStart)}><Download className="mr-1 h-3.5 w-3.5" /> Download weekly form</Button>
          {canEdit && statusLabel !== "approved" && <Button size="sm" onClick={() => onDecideBulk(ids, "approved")}><Check className="mr-1 h-3.5 w-3.5" /> Mark all approved</Button>}
          {canEdit && statusLabel !== "rejected" && <Button size="sm" variant="secondary" onClick={() => onDecideBulk(ids, "rejected")}><X className="mr-1 h-3.5 w-3.5" /> Mark all rejected</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => setExpanded((s) => !s)}>{expanded ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}{expanded ? "Hide" : "Manage per day"}</Button>}
        </div>

        {expanded && canEdit && (
          <div className="space-y-2 pt-2">
            {items.map((v) => (
              <VehicleManageCard key={v.id} v={v} userName={userName} userMeta={userMeta} onDelete={onDelete} onUpdate={onUpdate} onDecide={onDecide} canEdit={canEdit} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VehicleManageCard({ v, userName, userMeta, onDelete, onUpdate, onDecide, canEdit = true }: { v: any; userName: (id: string) => string; userMeta: (id: string) => any; onDelete: (id: string) => void; onUpdate: (id: string, patch: Record<string, any>) => void; onDecide: (id: string, s: "approved" | "rejected", notes?: string) => void; canEdit?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ destination: v.destination, date_needed: v.date_needed, time_from: v.time_from ?? "", time_to: v.time_to ?? "", purpose: v.purpose, passengers: v.passengers ?? 1 });
  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{v.destination} — {userName(v.user_id)}</p>
            <p className="text-xs text-muted-foreground">{format(parseISO(v.date_needed), "PPP")}{v.time_from ? ` · ${v.time_from}–${v.time_to ?? ""}` : ""} · Passengers: {v.passengers ?? 1}</p>
            {!editing && <p className="mt-1 text-xs">{v.purpose}</p>}
            {v.approver_notes && !editing && <p className="mt-1 rounded bg-muted px-2 py-1 text-xs"><strong>Note:</strong> {v.approver_notes}</p>}
          </div>
          <Badge className={v.status === "approved" ? "bg-success text-success-foreground" : ""} variant={v.status === "rejected" ? "destructive" : "default"}>{v.status}</Badge>
        </div>
        {editing ? (
          <VehicleEditFields form={form} setForm={setForm} onSave={() => { onUpdate(v.id, { ...form, time_from: form.time_from || null, time_to: form.time_to || null }); setEditing(false); }} onCancel={() => setEditing(false)} />
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>}
            {canEdit && v.status !== "approved" && <Button size="sm" onClick={() => onDecide(v.id, "approved")}><Check className="mr-1 h-3.5 w-3.5" /> Mark approved</Button>}
            {canEdit && v.status !== "rejected" && <Button size="sm" variant="secondary" onClick={() => onDecide(v.id, "rejected")}><X className="mr-1 h-3.5 w-3.5" /> Mark rejected</Button>}
            <Button size="sm" variant="outline" onClick={() => downloadVehicleRequestPDF(v, userMeta(v.user_id))}><Download className="mr-1 h-3.5 w-3.5" /> PDF</Button>
            {canEdit && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(v.id)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function VehicleEditFields({ form, setForm, onSave, onCancel }: { form: any; setForm: (f: any) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div><Label className="text-xs">Destination</Label><Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
      <div><Label className="text-xs">Date needed</Label><Input type="date" value={form.date_needed} onChange={(e) => setForm({ ...form, date_needed: e.target.value })} /></div>
      <div><Label className="text-xs">From</Label><Input type="time" value={form.time_from} onChange={(e) => setForm({ ...form, time_from: e.target.value })} /></div>
      <div><Label className="text-xs">To</Label><Input type="time" value={form.time_to} onChange={(e) => setForm({ ...form, time_to: e.target.value })} /></div>
      <div><Label className="text-xs">Passengers</Label><Input type="number" min={1} value={form.passengers} onChange={(e) => setForm({ ...form, passengers: Number(e.target.value) })} /></div>
      <div className="md:col-span-2"><Label className="text-xs">Purpose</Label><Textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
      <div className="md:col-span-2 flex gap-2">
        <Button size="sm" onClick={onSave}>Save changes</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function WorkPlanReadCard({ plan, userName, users = [], depts = [], onChanged, canEdit = true }: { plan: any; userName: (id: string) => string; users?: any[]; depts?: any[]; onChanged?: () => void; canEdit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string>(plan.status);

  const loadItems = async () => {
    const { data } = await supabase.from("work_plan_items").select("*").eq("work_plan_id", plan.id).order("activity_date");
    setItems((data as any[]) ?? []);
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && items === null) await loadItems();
  };

  const updateItem = (id: string, patch: Record<string, any>) => {
    setItems((cur) => (cur ?? []).map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const saveItem = async (it: any) => {
    const { error } = await supabase.from("work_plan_items").update({
      activity_date: it.activity_date,
      activity: it.activity,
      location: it.location || null,
      needs_vehicle: !!it.needs_vehicle,
      needs_money: !!it.needs_money,
      money_amount: it.money_amount === "" || it.money_amount == null ? null : Number(it.money_amount),
      notes: it.notes || null,
    }).eq("id", it.id);
    if (error) toast.error(error.message); else toast.success("Activity saved");
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this activity?")) return;
    const { error } = await supabase.from("work_plan_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Activity removed"); await loadItems(); }
  };

  const addItem = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from("work_plan_items").insert({
      work_plan_id: plan.id, activity_date: today, activity: "New activity",
      needs_vehicle: false, needs_money: false,
    }).select().single();
    if (error) toast.error(error.message);
    else setItems((cur) => [...(cur ?? []), data as any]);
  };

  const setPlanStatus = async (s: string) => {
    const { data, error } = await supabase.from("work_plans").update({ status: s }).eq("id", plan.id).select();
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error("No permission to update this plan"); return; }
    setStatus(s);
    toast.success(`Plan ${s}`);
    onChanged?.();
  };
  const handleDownload = async () => {
    let loaded = items;
    if (loaded === null) {
      const { data } = await supabase.from("work_plan_items").select("*").eq("work_plan_id", plan.id).order("activity_date");
      loaded = (data as any[]) ?? [];
      setItems(loaded);
    }
    const hod = users.find((u) => u.id === plan.user_id);
    const dept = depts.find((d) => d.id === (plan.department_id ?? hod?.department_id));
    downloadWorkPlanPDF({
      weekStartDate: plan.week_start_date,
      status: plan.status,
      signature: plan.signature,
      submittedAt: plan.submitted_at,
      hodName: hod?.full_name ?? plan.signature ?? userName(plan.user_id),
      hodPosition: hod?.position ?? null,
      departmentName: dept?.name ?? "—",
      items: (loaded ?? []).map((it: any) => ({
        activity_date: it.activity_date,
        activity: it.activity,
        location: it.location,
        needs_vehicle: !!it.needs_vehicle,
        needs_money: !!it.needs_money,
        money_amount: it.money_amount,
        notes: it.notes,
      })),
    });
  };


  return (
    <Card>
      <CardContent className="p-4">
        <button onClick={toggle} className="flex w-full items-center justify-between gap-3 text-left">
          <div>
            <p className="font-medium">{userName(plan.user_id)} · Week of {format(parseISO(plan.week_start_date), "MMM d, yyyy")}</p>
            <p className="text-xs text-muted-foreground">{plan.signature ? `Signed by ${plan.signature}` : "Unsigned"}{plan.submitted_at ? ` · Submitted ${format(parseISO(plan.submitted_at), "PPp")}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {status === "submitted" && (
              <>
                <Badge variant="secondary">SUBMITTED</Badge>
                <Badge variant="outline" className="text-destructive border-destructive">NOT APPROVED</Badge>
              </>
            )}
            {status === "approved" && (
              <Badge variant="default" className="bg-success text-success-foreground">SUBMITTED & APPROVED</Badge>
            )}
            {status !== "submitted" && status !== "approved" && (
              <Badge variant="outline">{status}</Badge>
            )}
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
        {open && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleDownload}><Download className="mr-1 h-3.5 w-3.5" /> Download PDF</Button>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {status !== "approved" && <Button size="sm" onClick={() => setPlanStatus("approved")}><Check className="mr-1 h-3.5 w-3.5" /> Approve plan</Button>}
                {status === "approved" && <Button size="sm" variant="outline" onClick={() => setPlanStatus("submitted")}>Unapprove</Button>}
                <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)}><Pencil className="mr-1 h-3.5 w-3.5" /> {editing ? "Done editing" : "Edit activities"}</Button>
                {editing && <Button size="sm" variant="outline" onClick={addItem}><Plus className="mr-1 h-3.5 w-3.5" /> Add activity</Button>}
              </div>
            )}
            {items === null && <p className="text-xs text-muted-foreground">Loading…</p>}
            {items?.length === 0 && <p className="text-xs text-muted-foreground italic">No activities recorded.</p>}
            {items?.map((it) => editing ? (
              <div key={it.id} className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <div><Label className="text-xs">Date</Label><Input type="date" value={it.activity_date} onChange={(e) => updateItem(it.id, { activity_date: e.target.value })} /></div>
                  <div><Label className="text-xs">Location</Label><Input value={it.location ?? ""} onChange={(e) => updateItem(it.id, { location: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label className="text-xs">Activity</Label><Textarea rows={2} value={it.activity} onChange={(e) => updateItem(it.id, { activity: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label className="text-xs">Notes</Label><Input value={it.notes ?? ""} onChange={(e) => updateItem(it.id, { notes: e.target.value })} /></div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={!!it.needs_vehicle} onCheckedChange={(v) => updateItem(it.id, { needs_vehicle: !!v })} /> Needs vehicle</label>
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={!!it.needs_money} onCheckedChange={(v) => updateItem(it.id, { needs_money: !!v })} /> Needs money</label>
                  {it.needs_money && <Input type="number" className="w-32" value={it.money_amount ?? ""} onChange={(e) => updateItem(it.id, { money_amount: e.target.value })} placeholder="KES" />}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => saveItem(it)}>Save</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteItem(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={it.id} className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">{format(parseISO(it.activity_date), "EEE, MMM d")}</p>
                <p className="mt-1">{it.activity}</p>
                {it.location && <p className="text-xs text-muted-foreground">Location: {it.location}</p>}
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {it.needs_vehicle && <span>🚗 Needs vehicle</span>}
                  {it.needs_money && <span>💰 KES {Number(it.money_amount ?? 0).toLocaleString()}</span>}
                </div>
                {it.notes && <p className="mt-1 text-xs italic">{it.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

