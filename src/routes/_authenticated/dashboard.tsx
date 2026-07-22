import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, startOfWeek } from "date-fns";
import { ClipboardList, Car, BookText, FileBarChart, ArrowRight, CalendarDays, ChevronDown, Download, Pencil, Truck } from "lucide-react";
import { AttendanceLogPanel } from "@/components/AttendanceLogPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface Stats {
  thisWeekPlan: { id: string; status: string } | null;
  pendingVehicles: number;
  myVehicles: number;
  daysLogged: number;
}

interface Submission { kind: "plan" | "log" | "vehicle"; id: string; user: string; when: string; label: string; status?: string }

function Dashboard() {
  const { profile, user, isSuperAdmin, isHod } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [feed, setFeed] = useState<Submission[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [eventDepts, setEventDepts] = useState<Record<string, string>>({});
  const [depts, setDepts] = useState<any[]>([]);
  const [editEvent, setEditEvent] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [vehiclesOut, setVehiclesOut] = useState<Array<{ id: string; registration: string; department: string; driver: string; start_point: string; destination: string }>>([]);

  useEffect(() => {
    if (!user) return;
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    (async () => {
      const [plan, myVeh, logs, deptRow] = await Promise.all([
        supabase.from("work_plans").select("id,status").eq("user_id", user.id).eq("week_start_date", weekStart).maybeSingle(),
        supabase.from("vehicle_requests").select("id,status").eq("user_id", user.id).gte("week_start_date", weekStart),
        supabase.from("daily_logs").select("id").eq("user_id", user.id).gte("log_date", weekStart),
        profile?.department_id
          ? supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      let pendingVehicles = 0;
      if (isSuperAdmin) {
        const { count } = await supabase.from("vehicle_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
        pendingVehicles = count ?? 0;

        const [{ data: rp }, { data: rl }, { data: rv }, { data: ppl }] = await Promise.all([
          supabase.from("work_plans").select("id,user_id,week_start_date,submitted_at,status").in("status", ["submitted", "approved"]).not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(10),
          supabase.from("daily_logs").select("id,user_id,log_date,created_at").order("created_at", { ascending: false }).limit(10),
          supabase.from("vehicle_requests").select("id,user_id,destination,date_needed,created_at,status").order("created_at", { ascending: false }).limit(10),
          supabase.from("profiles").select("id,full_name"),
        ]);
        const nameOf = (id: string) => (ppl as any[] | null)?.find((p) => p.id === id)?.full_name ?? "Someone";
        const subs: Submission[] = [
          ...((rp as any[]) ?? []).map((p) => ({ kind: "plan" as const, id: p.id, user: nameOf(p.user_id), when: p.submitted_at ?? p.week_start_date, label: `Work plan for week of ${format(new Date(p.week_start_date), "MMM d")}`, status: p.status })),
          ...((rl as any[]) ?? []).map((l) => ({ kind: "log" as const, id: l.id, user: nameOf(l.user_id), when: l.created_at, label: `Daily log · ${format(new Date(l.log_date), "MMM d")}` })),
          ...((rv as any[]) ?? []).map((v) => ({ kind: "vehicle" as const, id: v.id, user: nameOf(v.user_id), when: v.created_at, label: `Vehicle: ${v.destination} (${format(new Date(v.date_needed), "MMM d")})`, status: v.status })),
        ].sort((a, b) => +new Date(b.when) - +new Date(a.when)).slice(0, 3);
        setFeed(subs);
      }

      setStats({
        thisWeekPlan: (plan.data as { id: string; status: string } | null) ?? null,
        pendingVehicles,
        myVehicles: myVeh.data?.length ?? 0,
        daysLogged: logs.data?.length ?? 0,
      });
      setDept((deptRow.data as { name: string } | null)?.name ?? null);

      const today = format(new Date(), "yyyy-MM-dd");
      const farAhead = format(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const allDeptsRes = await supabase.from("departments").select("id,name").order("name");
      setDepts((allDeptsRes.data as any[]) ?? []);
      const { data: evs } = await supabase.from("diocesan_events").select("*").gte("event_date", today).lte("event_date", farAhead).order("event_date", { ascending: true });
      setEvents((evs as any) ?? []);
      const map: Record<string, string> = {};
      ((allDeptsRes.data as any[]) ?? []).forEach((d) => { map[d.id] = d.name; });
      setEventDepts(map);
    })();
  }, [user, profile?.department_id, isSuperAdmin]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_vehicles_out_now" as any);
      if (error || cancelled) return;
      const rows = (data as any[]) ?? [];
      setVehiclesOut(rows.map((r) => ({
        id: r.id,
        registration: r.vehicle_registration ?? "—",
        department: r.department_name ?? "—",
        driver: r.driver_name ?? "—",
        start_point: r.start_point ?? "",
        destination: r.destination ?? "",
      })));
    };
    load();
    const iv = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user]);

  const weekLabel = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "MMMM d, yyyy");

  const oneWeekAheadMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const thisWeekEvents = events.filter((ev) => +new Date(ev.event_date) <= oneWeekAheadMs);
  const laterEvents = events.filter((ev) => +new Date(ev.event_date) > oneWeekAheadMs);

  const downloadEventsPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Upcoming Diocesan Events", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Date", "Title", "Venue", "Spearheaded By", "Notes"]],
      body: events.map((ev) => [
        format(new Date(ev.event_date), "EEE, MMM d, yyyy"),
        ev.title ?? "",
        ev.venue ?? "",
        ev.department_id ? eventDepts[ev.department_id] ?? "" : "",
        ev.notes ?? "",
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [128, 0, 32] },
    });
    doc.save(`diocesan-events-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const saveEventEdit = async () => {
    if (!editEvent?.title?.trim() || !editEvent?.event_date) return;
    const { error } = await supabase.from("diocesan_events").update({
      title: editEvent.title.trim(),
      event_date: editEvent.event_date,
      department_id: editEvent.department_id === "none" || !editEvent.department_id ? null : editEvent.department_id,
      venue: editEvent.venue?.trim() || null,
      notes: editEvent.notes?.trim() || null,
    }).eq("id", editEvent.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Event updated");
    setEvents((prev) => prev.map((e) => e.id === editEvent.id ? { ...e, ...editEvent } : e));
    setEditDialogOpen(false);
    setEditEvent(null);
  };

  const dashboardBody = (
    <div className="space-y-6">
      {(
        <Card className="border-2 border-primary/60 shadow-lg overflow-hidden">
          <CardHeader className="bg-primary/5 py-3">
            <CardTitle className="font-serif flex items-center gap-3 text-xl md:text-2xl">
              <Truck className="h-6 w-6" />
              VEHICLES OUT NOW
              <Badge className="ml-1 bg-green-600 hover:bg-green-600 text-sm px-2.5 py-0.5">{vehiclesOut.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {vehiclesOut.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No vehicles currently out.</p>
            ) : (
              <div className="group relative w-full overflow-hidden bg-primary/[0.03] py-3">
                <div
                  className="flex w-max gap-8 whitespace-nowrap"
                  style={{ animation: `vehicles-marquee ${Math.max(20, vehiclesOut.length * 8)}s linear infinite` }}
                >
                  {[...vehiclesOut, ...vehiclesOut].map((v, i) => (
                    <div key={`${v.id}-${i}`} className="flex items-center gap-2 text-sm md:text-base">
                      <Truck className="h-4 w-4 text-primary" />
                      <span className="font-mono font-bold">{v.registration}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-medium">{v.department}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>Driver: <span className="font-semibold">{v.driver}</span></span>
                      <span className="text-muted-foreground">·</span>
                      <span>{v.start_point} → {v.destination}</span>
                      <Badge className="ml-2 bg-green-600 hover:bg-green-600 text-xs">Active</Badge>
                    </div>
                  ))}
                </div>
                <style>{`@keyframes vehicles-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upcoming Events - Light Red themed */}
      <Card className="border-l-4 border-l-[#800020] bg-[#C97B84] dark:bg-[#7a3b44]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#800020]">
              <CalendarDays className="h-4 w-4" />
            </div>
            <CardTitle className="font-serif font-bold uppercase !text-black">Upcoming Diocesan Events</CardTitle>
          </div>
          <CardDescription className="font-bold text-black/90">Events happening within the next one week.</CardDescription>

        </CardHeader>
        <CardContent className="space-y-3">

          {thisWeekEvents.length === 0 ? (
            <p className="text-sm text-white/80">No events in the next one week.</p>
          ) : (
            thisWeekEvents.map((ev) => (
              <div key={ev.id} className="overflow-hidden rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-900/40 p-3">

                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-foreground">{ev.title}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {format(new Date(ev.event_date), "EEEE, MMM d, yyyy")}
                      {ev.department_id && eventDepts[ev.department_id] && <> · Spearheaded by <span className="font-semibold text-[#800020] dark:text-red-300">{eventDepts[ev.department_id]}</span></>}
                      {ev.venue && <> · <span className="text-[#800020]/80 dark:text-red-300/80">{ev.venue}</span></>}
                    </p>
                  </div>
                  <Badge className="shrink-0 self-start bg-white/90 text-[#800020] border-red-200 dark:bg-red-900/80 dark:text-red-100 dark:border-red-800">{format(new Date(ev.event_date), "MMM d")}</Badge>

                </div>
                {ev.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{ev.notes}</p>}
              </div>
            ))
          )}

          {events.length > 0 && (
            <Collapsible className="rounded-lg border border-red-200/60 bg-white/80 dark:border-red-800/60 dark:bg-red-950/40">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-[#800020] hover:bg-red-100/50 dark:text-red-100 dark:hover:bg-red-900/50 [&[data-state=open]>svg]:rotate-180">

                <span>All upcoming events ({events.length}){laterEvents.length > 0 && <> · {laterEvents.length} beyond this week</>}</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 p-3 pt-0">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={downloadEventsPdf} className="gap-2">
                    <Download className="h-4 w-4" /> Download PDF
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Venue</TableHead>
                        <TableHead>Spearheaded By</TableHead>
                        <TableHead>Notes</TableHead>
                        {isSuperAdmin && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="whitespace-nowrap">{format(new Date(ev.event_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{ev.title}</TableCell>
                          <TableCell>{ev.venue ?? "—"}</TableCell>
                          <TableCell>{ev.department_id ? eventDepts[ev.department_id] ?? "—" : "—"}</TableCell>
                          <TableCell className="max-w-xs whitespace-pre-wrap break-words text-xs text-muted-foreground">{ev.notes ?? ""}</TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => { setEditEvent({ ...ev }); setEditDialogOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Edit Event Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Diocesan Event</DialogTitle>
          </DialogHeader>
          {editEvent && (
            <div className="grid gap-3">
              <div><Label>Title *</Label><Input required maxLength={200} value={editEvent.title} onChange={(e) => setEditEvent({ ...editEvent, title: e.target.value })} /></div>
              <div><Label>Date *</Label><Input required type="date" value={editEvent.event_date} onChange={(e) => setEditEvent({ ...editEvent, event_date: e.target.value })} /></div>
              <div>
                <Label>Department spearheading</Label>
                <Select value={editEvent.department_id ?? "none"} onValueChange={(v) => setEditEvent({ ...editEvent, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Venue</Label><Input maxLength={200} value={editEvent.venue ?? ""} onChange={(e) => setEditEvent({ ...editEvent, venue: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea maxLength={2000} value={editEvent.notes ?? ""} onChange={(e) => setEditEvent({ ...editEvent, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveEventEdit}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Welcome */}
      <div className="overflow-hidden rounded-xl bg-primary p-5 text-white shadow-md">
        <p className="text-sm font-bold text-white">Welcome back</p>
        <h1 className="break-words text-3xl font-bold text-white md:text-4xl" style={{ color: "#ffffff" }}>{profile?.full_name ?? "Friend"}</h1>
        <p className="mt-1 break-words text-sm font-bold text-white">
          {dept ? <>Department: <span className="font-bold text-white">{dept}</span> · </> : "No department assigned yet · "}
          Week of {weekLabel}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ClipboardList} title="This week's plan" value={stats?.thisWeekPlan ? (stats.thisWeekPlan.status === "submitted" || stats.thisWeekPlan.status === "approved" ? "Submitted" : "Draft") : "Not started"} tone={stats?.thisWeekPlan && (stats.thisWeekPlan.status === "submitted" || stats.thisWeekPlan.status === "approved") ? "success" : stats?.thisWeekPlan ? "warning" : "muted"} to="/work-plans" />
        <StatCard icon={Car} title="My vehicle requests (week)" value={String(stats?.myVehicles ?? 0)} to="/vehicle-requests" />
        <StatCard icon={BookText} title="Days logged this week" value={String(stats?.daysLogged ?? 0)} to="/daily-log" />
        <StatCard icon={FileBarChart} title={isSuperAdmin ? "Pending vehicle approvals" : "Monthly reports"} value={isSuperAdmin ? String(stats?.pendingVehicles ?? 0) : "Generate"} to={isSuperAdmin ? "/admin" : "/reports"} tone={isSuperAdmin && (stats?.pendingVehicles ?? 0) > 1 ? "warning" : "muted"} />
      </div>

      {/* Checklist - Green accent */}
      <Card className="border-t-4 border-t-accent">
        <CardHeader>
          <CardTitle className="font-serif text-primary">Your Monday Checklist</CardTitle>
          <CardDescription>Complete these every Monday for the week ahead.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ChecklistRow done={!!stats?.thisWeekPlan && (stats.thisWeekPlan.status === "submitted" || stats.thisWeekPlan.status === "approved")} title="Submit your weekly work plan" to="/work-plans" />
          <ChecklistRow done={(stats?.myVehicles ?? 0) > 0} title="Submit vehicle request (if needed)" to="/vehicle-requests" />
          <ChecklistRow done={(stats?.daysLogged ?? 0) > 0} title="Log daily challenges & achievements" to="/daily-log" />
        </CardContent>
      </Card>

      {/* Recent Submissions - Maroon themed */}
      {isSuperAdmin && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="font-serif text-primary">Recent Submissions</CardTitle>
            <CardDescription>Latest work plans, daily logs, and vehicle requests across the secretariat offices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 overflow-hidden">
            {feed.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
            {feed.map((s) => (
              <Link key={`${s.kind}-${s.id}`} to="/admin" search={{ tab: undefined }} className="flex w-full max-w-full flex-col gap-1.5 overflow-hidden rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/80 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words [overflow-wrap:anywhere]"><span className="font-semibold text-foreground">{s.user}</span> · {s.label}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(s.when), "PPp")}</p>
                </div>
                <Badge className={`shrink-0 self-start whitespace-nowrap ${s.kind === "plan" ? "bg-primary/15 text-primary border-primary/20" : s.kind === "vehicle" ? "bg-accent/15 text-accent border-accent/20" : "bg-secondary text-secondary-foreground"}`}>{s.kind}{s.status ? ` · ${s.status}` : ""}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Leadership */}
      {(isHod || isSuperAdmin) && (
        <Card className="bg-gradient-to-br from-primary/[0.08] to-accent/[0.08]">
          <CardHeader>
            <CardTitle className="font-serif text-primary">Leadership</CardTitle>
            <CardDescription>{isSuperAdmin ? "Oversee all departments, approve vehicle requests, and review reports." : "Review your department's work plans, logs and reports."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(isHod || isSuperAdmin) && <Link to="/department"><Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">Open department view</Button></Link>}
            {isSuperAdmin && <Link to="/admin" search={{ tab: undefined }}><Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Administration</Button></Link>}
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 overflow-hidden">
      {isSuperAdmin ? (
        <Tabs defaultValue="overview">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Office Attendance</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-4">
            {dashboardBody}
          </TabsContent>
          <TabsContent value="attendance" className="pt-4">
            <AttendanceLogPanel />
          </TabsContent>
        </Tabs>
      ) : (
        dashboardBody
      )}
    </div>
  );
}

function StatCard({ icon: Icon, title, value, to, tone = "muted" }: { icon: any; title: string; value: string; to: string; tone?: "success" | "warning" | "muted" }) {
  const toneClass = tone === "success" ? "text-accent" : tone === "warning" ? "text-warning-foreground" : "text-foreground";
  const cardAccent = tone === "success" ? "border-t-4 border-t-accent" : tone === "warning" ? "border-t-4 border-t-warning" : "border-t-4 border-t-primary/40";
  return (
    <Link to={to}>
      <Card className={`transition-shadow hover:shadow-lg ${cardAccent}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${tone === "success" ? "bg-accent/15 text-accent" : tone === "warning" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-primary"}`}>
              <Icon className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{title}</p>
          <p className={`mt-1 font-serif text-2xl ${toneClass}`}>{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function ChecklistRow({ done, title, to }: { done: boolean; title: string; to: string }) {
  return (
    <Link to={to} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${done ? "border-accent bg-accent text-accent-foreground" : "border-muted-foreground/30"}`}>{done ? "✓" : ""}</span>
        <span className="break-words text-sm">{title}</span>
      </div>
      {done ? <Badge className="w-fit bg-accent/15 text-accent border-accent/20">Done</Badge> : <Badge variant="outline" className="w-fit">Pending</Badge>}
    </Link>
  );
}
