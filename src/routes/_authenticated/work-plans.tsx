import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, startOfWeek, addDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { downloadWorkPlanPDF } from "@/lib/work-plan-pdf";

export const Route = createFileRoute("/_authenticated/work-plans")({
  component: WorkPlansPage,
});

interface Item {
  id?: string;
  activity_date: string;
  activity: string;
  location: string;
  needs_vehicle: boolean;
  needs_money: boolean;
  money_amount: string;
  notes: string;
}

interface Plan {
  id: string;
  status: "draft" | "submitted" | "approved";
  signature: string | null;
  submitted_at: string | null;
  week_start_date: string;
  approved_by?: string | null;
  approved_at?: string | null;
}

function WorkPlansPage() {
  const { user, profile } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Plan[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const weekStartStr = useMemo(() => format(weekStart, "yyyy-MM-dd"), [weekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = async () => {
    if (!user) return;
    const { data: p } = await supabase
      .from("work_plans").select("*").eq("user_id", user.id).eq("week_start_date", weekStartStr).maybeSingle();

    if (p) {
      const planRow = p as Plan;
      setPlan(planRow);
      setIsEditing(false);
      setSignature(planRow.signature ?? "");
      const { data: its } = await supabase
        .from("work_plan_items").select("*").eq("work_plan_id", planRow.id).order("activity_date");
      setItems(((its as any[]) ?? []).map((i) => ({
        id: i.id,
        activity_date: i.activity_date,
        activity: i.activity,
        location: i.location ?? "",
        needs_vehicle: i.needs_vehicle,
        needs_money: i.needs_money,
        money_amount: i.money_amount?.toString() ?? "",
        notes: i.notes ?? "",
      })));
    } else {
      setPlan(null);
      setItems([]);
      setSignature("");
      setIsEditing(false);
    }

    const { data: hist } = await supabase
      .from("work_plans").select("id,status,signature,submitted_at,week_start_date")
      .eq("user_id", user.id).order("week_start_date", { ascending: false }).limit(8);
    setHistory((hist as Plan[]) ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, weekStartStr]);

  const addItem = (date: Date) => {
    setItems((cur) => [...cur, {
      activity_date: format(date, "yyyy-MM-dd"),
      activity: "", location: "", needs_vehicle: false, needs_money: false, money_amount: "", notes: "",
    }]);
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((cur) => cur.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const removeItem = (idx: number) => setItems((cur) => cur.filter((_, i) => i !== idx));

  const ensurePlan = async (status: "draft" | "submitted", sig?: string) => {
    if (!user) return null;
    if (plan) {
      const updates: any = { status };
      if (status === "submitted") { updates.signature = sig ?? signature; updates.submitted_at = new Date().toISOString(); }
      const { data } = await supabase.from("work_plans").update(updates).eq("id", plan.id).select().single();
      return data as Plan;
    }
    const insert: any = { user_id: user.id, department_id: profile?.department_id ?? null, week_start_date: weekStartStr, status };
    if (status === "submitted") { insert.signature = sig ?? signature; insert.submitted_at = new Date().toISOString(); }
    const { data, error } = await supabase.from("work_plans").insert(insert).select().single();
    if (error) { toast.error(error.message); return null; }
    return data as Plan;
  };

  const saveItems = async (planId: string) => {
    await supabase.from("work_plan_items").delete().eq("work_plan_id", planId);
    if (items.length === 0) return;
    const rows = items.filter((i) => i.activity.trim()).map((i) => ({
      work_plan_id: planId,
      activity_date: i.activity_date,
      activity: i.activity,
      location: i.location || null,
      needs_vehicle: i.needs_vehicle,
      needs_money: i.needs_money,
      money_amount: i.money_amount ? Number(i.money_amount) : null,
      notes: i.notes || null,
    }));
    if (rows.length) await supabase.from("work_plan_items").insert(rows);
  };

  const handleSaveDraft = async () => {
    setBusy(true);
    const p = await ensurePlan("draft");
    if (p) { await saveItems(p.id); toast.success("Draft saved"); await load(); }
    setBusy(false);
  };

  const handleSubmit = async () => {
    if (!signature.trim()) { toast.error("Please type your name as signature"); return; }
    if (items.filter((i) => i.activity.trim()).length === 0) { toast.error("Add at least one activity"); return; }
    setBusy(true);
    const p = await ensurePlan("submitted", signature);
    if (p) { await saveItems(p.id); toast.success("Work plan submitted"); await load(); }
    setBusy(false);
  };

  const handleUpdate = async () => {
    if (!plan) return;
    setBusy(true);
    await saveItems(plan.id);
    await supabase.from("work_plans").update({ updated_at: new Date().toISOString() }).eq("id", plan.id);
    toast.success("Work plan updated");
    setIsEditing(false);
    await load();
    setBusy(false);
  };

  const handleDownload = async () => {
    if (!plan) return;
    let departmentName = "—";
    if (profile?.department_id) {
      const { data: d } = await supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle();
      departmentName = (d as any)?.name ?? "—";
    }
    downloadWorkPlanPDF({
      weekStartDate: plan.week_start_date,
      status: plan.status,
      signature: plan.signature,
      submittedAt: plan.submitted_at,
      hodName: profile?.full_name ?? plan.signature ?? "",
      hodPosition: profile?.position ?? null,
      departmentName,
      items: items.map((it) => ({
        activity_date: it.activity_date,
        activity: it.activity,
        location: it.location || null,
        needs_vehicle: it.needs_vehicle,
        needs_money: it.needs_money,
        money_amount: it.money_amount || null,
        notes: it.notes || null,
      })),
    });
  };

  const submitted = plan?.status === "submitted" || plan?.status === "approved";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Weekly Work Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plan day-by-day. Submit on Monday with your signature.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="rounded-md border border-border bg-card px-3 py-1.5 text-sm">
            Week of <span className="font-medium">{format(weekStart, "MMM d, yyyy")}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {submitted && !isEditing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          <span>Submitted on {plan?.submitted_at ? format(parseISO(plan.submitted_at), "PPp") : ""} — signed by {plan?.signature}.</span>
          <Button size="sm" variant="outline" onClick={handleDownload}><Download className="mr-1 h-3.5 w-3.5" /> Download PDF</Button>
        </div>
      )}

      {/* Read-only view for submitted plans when not editing */}
      {submitted && !isEditing ? (
        <div className="space-y-4">
          {weekDays.map((d) => {
            const dStr = format(d, "yyyy-MM-dd");
            const dayItems = items.filter((it) => it.activity_date === dStr);
            if (dayItems.length === 0) return null;
            return (
              <Card key={dStr}>
                <CardHeader className="pb-3">
                  <CardTitle className="font-serif text-xl">{format(d, "EEEE")}</CardTitle>
                  <CardDescription>{format(d, "PPP")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dayItems.map((it, idx) => (
                    <div key={idx} className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="font-medium">{it.activity}</div>
                      <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                        {it.location && <span>Location: {it.location}</span>}
                        {it.notes && <span>Notes: {it.notes}</span>}
                        {it.needs_vehicle && <Badge variant="outline">Needs vehicle</Badge>}
                        {it.needs_money && <Badge variant="outline">Money: KES {it.money_amount}</Badge>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardHeader><CardTitle className="font-serif">Signature</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">Signed by: <span className="font-medium">{signature}</span></p>
              <div className="mt-4">
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Editable form */
        <>
          <div className="space-y-4">
            {weekDays.map((d) => {
              const dStr = format(d, "yyyy-MM-dd");
              const dayItems = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.activity_date === dStr);
              return (
                <Card key={dStr}>
                  <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                    <div>
                      <CardTitle className="font-serif text-xl">{format(d, "EEEE")}</CardTitle>
                      <CardDescription>{format(d, "PPP")}</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => addItem(d)}><Plus className="mr-1 h-3.5 w-3.5" />Add activity</Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dayItems.length === 0 && <p className="text-sm text-muted-foreground italic">No activities planned.</p>}
                    {dayItems.map(({ it, idx }) => (
                      <div key={idx} className="rounded-lg border border-border bg-muted/30 p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <Label>Activity</Label>
                            <Textarea rows={2} value={it.activity} onChange={(e) => updateItem(idx, { activity: e.target.value })} placeholder="What will you do?" />
                          </div>
                          <div>
                            <Label>Location</Label>
                            <Input value={it.location} onChange={(e) => updateItem(idx, { location: e.target.value })} placeholder="Where?" />
                          </div>
                          <div>
                            <Label>Notes</Label>
                            <Input value={it.notes} onChange={(e) => updateItem(idx, { notes: e.target.value })} placeholder="Optional" />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-5">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={it.needs_vehicle} onCheckedChange={(v) => updateItem(idx, { needs_vehicle: !!v })} /> Needs vehicle
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={it.needs_money} onCheckedChange={(v) => updateItem(idx, { needs_money: !!v })} /> Needs money
                          </label>
                          {it.needs_money && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Amount (KES)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="w-40"
                                placeholder="e.g. 5000"
                                value={it.money_amount}
                                onChange={(e) => updateItem(idx, { money_amount: e.target.value.replace(/[^\d.]/g, "") })}
                              />
                            </div>
                          )}

                          <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => removeItem(idx)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader><CardTitle className="font-serif">Signature & Submit</CardTitle><CardDescription>By submitting, you confirm this is your work plan for the week.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-md">
                <Label>Signature (type your full name)</Label>
                <Input disabled={submitted} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={profile?.full_name ?? ""} />
              </div>
              <div className="flex flex-wrap gap-2">
                {!submitted && <Button variant="outline" onClick={handleSaveDraft} disabled={busy}>Save draft</Button>}
                {!submitted && <Button onClick={handleSubmit} disabled={busy}>Submit work plan</Button>}
                {submitted && isEditing && (
                  <>
                    <Button variant="outline" onClick={() => { setIsEditing(false); load(); }} disabled={busy}>Cancel</Button>
                    <Button onClick={handleUpdate} disabled={busy}>Update</Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Separator />
      <div>
        <h2 className="font-serif text-xl">Recent weeks</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {history.length === 0 && <p className="text-sm text-muted-foreground">No plans yet.</p>}
          {history.map((h) => (
            <button key={h.id} onClick={() => setWeekStart(parseISO(h.week_start_date))} className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-left hover:bg-muted">
              <span className="text-sm">Week of {format(parseISO(h.week_start_date), "MMM d, yyyy")}</span>
              <Badge variant={h.status === "submitted" ? "default" : "outline"} className={h.status === "submitted" ? "bg-success text-success-foreground" : ""}>{h.status}</Badge>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
