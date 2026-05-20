import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Plus, ShieldCheck, ShieldOff, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Role = "super_admin" | "hod" | "staff";

function AdminPage() {
  const { isSuperAdmin } = useAuth();
  const [depts, setDepts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, Role[]>>({});
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [newDept, setNewDept] = useState({ name: "", description: "" });

  const load = async () => {
    const [{ data: d }, { data: u }, { data: r }, { data: v }] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("profiles").select("id,full_name,email,position,department_id").order("full_name"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("vehicle_requests").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setDepts((d as any) ?? []);
    setUsers((u as any) ?? []);
    const map: Record<string, Role[]> = {};
    ((r as any[]) ?? []).forEach((row) => { (map[row.user_id] ||= []).push(row.role); });
    setRolesByUser(map);
    setVehicles((v as any) ?? []);
  };
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin]);

  if (!isSuperAdmin) return <p className="text-muted-foreground">Access denied. Super Admin only.</p>;

  const addDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDept.name.trim()) return;
    const { error } = await supabase.from("departments").insert(newDept);
    if (error) toast.error(error.message);
    else { toast.success("Department created"); setNewDept({ name: "", description: "" }); load(); }
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

  const userName = (id: string) => users.find((u) => u.id === id)?.full_name ?? "—";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-foreground">Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage departments, users, roles, and vehicle approvals.</p>
      </div>

      <Tabs defaultValue="vehicles">
        <TabsList>
          <TabsTrigger value="vehicles">Vehicle approvals</TabsTrigger>
          <TabsTrigger value="depts">Departments</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="space-y-3 pt-4">
          {vehicles.filter((v) => v.status === "pending").length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No pending vehicle requests.</CardContent></Card>
          )}
          {vehicles.filter((v) => v.status === "pending").map((v) => (
            <VehicleApproveCard key={v.id} v={v} userName={userName} onDecide={decideVehicle} />
          ))}
          <h3 className="mt-6 font-serif text-lg">Recent decisions</h3>
          {vehicles.filter((v) => v.status !== "pending").slice(0, 10).map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="font-medium">{v.destination} — {userName(v.user_id)}</p>
                  <p className="text-xs text-muted-foreground">{format(parseISO(v.date_needed), "PPP")}</p>
                </div>
                <Badge className={v.status === "approved" ? "bg-success text-success-foreground" : ""} variant={v.status === "rejected" ? "destructive" : "default"}>{v.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="depts" className="space-y-4 pt-4">
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

          {depts.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="font-serif">{d.name}</CardTitle>
                {d.description && <CardDescription>{d.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <Label>Head of Department</Label>
                <Select value={d.hod_id ?? "none"} onValueChange={(v) => setHod(d.id, v === "none" ? null : v)}>
                  <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose HOD" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {users.filter((u) => u.department_id === d.id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="users" className="space-y-3 pt-4">
          {users.map((u) => {
            const userRoles = rolesByUser[u.id] ?? [];
            return (
              <Card key={u.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {userRoles.map((r) => <Badge key={r} variant="secondary">{r.replace("_", " ")}</Badge>)}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Department</Label>
                      <Select value={u.department_id ?? "none"} onValueChange={(v) => assignDepartment(u.id, v === "none" ? null : v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      {(["super_admin","hod","staff"] as Role[]).map((r) => (
                        <Button key={r} variant={userRoles.includes(r) ? "default" : "outline"} size="sm" onClick={() => toggleRole(u.id, r)}>
                          {userRoles.includes(r) ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : <ShieldOff className="mr-1 h-3.5 w-3.5" />}
                          {r.replace("_", " ")}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VehicleApproveCard({ v, userName, onDecide }: { v: any; userName: (id: string) => string; onDecide: (id: string, s: "approved" | "rejected", notes?: string) => void }) {
  const [notes, setNotes] = useState("");
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
        <p className="text-sm">{v.purpose}</p>
        <p className="text-xs text-muted-foreground">Passengers: {v.passengers ?? 1}</p>
        <Textarea rows={2} placeholder="Optional note to requester" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onDecide(v.id, "approved", notes)}><Check className="mr-1 h-4 w-4" /> Approve</Button>
          <Button size="sm" variant="destructive" onClick={() => onDecide(v.id, "rejected", notes)}><X className="mr-1 h-4 w-4" /> Reject</Button>
        </div>
      </CardContent>
    </Card>
  );
}
