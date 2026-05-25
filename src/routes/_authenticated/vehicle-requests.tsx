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
import { format, startOfWeek, parseISO } from "date-fns";
import { toast } from "sonner";
import { Car, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vehicle-requests")({
  component: VehicleRequestsPage,
});

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
  created_at: string;
}

function VehicleRequestsPage() {
  const { user, profile } = useAuth();
  const [list, setList] = useState<VR[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date_needed: format(new Date(), "yyyy-MM-dd"),
    time_from: "09:00",
    time_to: "17:00",
    destination: "",
    purpose: "",
    passengers: 1,
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("vehicle_requests").select("*").eq("user_id", user.id).order("date_needed", { ascending: false });
    setList((data as VR[]) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const weekStart = format(startOfWeek(parseISO(form.date_needed), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const { error } = await supabase.from("vehicle_requests").insert({
      user_id: user.id,
      department_id: profile?.department_id ?? null,
      week_start_date: weekStart,
      date_needed: form.date_needed,
      time_from: form.time_from || null,
      time_to: form.time_to || null,
      destination: form.destination,
      purpose: form.purpose,
      passengers: form.passengers,
      status: "pending",
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Vehicle request submitted for approval");
      setShowForm(false);
      setForm({ date_needed: format(new Date(), "yyyy-MM-dd"), time_from: "09:00", time_to: "17:00", destination: "", purpose: "", passengers: 1 });
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
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <div><Label>Date needed</Label><Input type="date" required value={form.date_needed} onChange={(e) => setForm({ ...form, date_needed: e.target.value })} /></div>
              <div><Label>Passengers</Label><Input type="number" min={1} required value={form.passengers} onChange={(e) => setForm({ ...form, passengers: Number(e.target.value) })} /></div>
              <div><Label>From (time)</Label><Input type="time" value={form.time_from} onChange={(e) => setForm({ ...form, time_from: e.target.value })} /></div>
              <div><Label>To (time)</Label><Input type="time" value={form.time_to} onChange={(e) => setForm({ ...form, time_to: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Destination</Label><Input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Purpose</Label><Textarea required rows={3} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={busy}>Submit request</Button>
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
        {list.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-serif text-lg">{r.destination}</p>
                  <p className="text-sm text-muted-foreground">{format(parseISO(r.date_needed), "EEEE, MMM d, yyyy")}{r.time_from ? ` · ${r.time_from}–${r.time_to ?? ""}` : ""}</p>
                </div>
                <StatusBadge s={r.status} />
              </div>
              <p className="mt-2 text-sm">{r.purpose}</p>
              <p className="mt-1 text-xs text-muted-foreground">Passengers: {r.passengers ?? 1}</p>
              {r.approver_notes && (
                <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs"><strong>Secretary's note:</strong> {r.approver_notes}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: VR["status"] }) {
  if (s === "approved") return <Badge className="bg-success text-success-foreground">Approved</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}
