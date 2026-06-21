import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfWeek, endOfWeek, parseISO, addDays } from "date-fns";
import { toast } from "sonner";
import { Download, ChevronDown, ChevronRight, ClipboardList, Save, Trash2, FileText } from "lucide-react";
import {
  buildAllDepartmentsWorkPlansPDF,
  downloadAllDepartmentsWorkPlansPDF,
  type DeptWorkPlanPDF,
} from "@/lib/all-workplans-pdf";

export const Route = createFileRoute("/_authenticated/all-workplans")({
  component: AllWorkPlansPage,
});

interface WPRow {
  id: string;
  user_id: string;
  department_id: string | null;
  status: string;
  signature: string | null;
  submitted_at: string | null;
  week_start_date: string;
}

interface SavedRow {
  id: string;
  week_start_date: string;
  week_end_date: string;
  file_path: string;
  department_count: number;
  generated_by_name: string | null;
  created_at: string;
}

function AllWorkPlansPage() {
  const { canViewAll, profile, user } = useAuth();
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<DeptWorkPlanPDF[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedRow[]>([]);

  const currentWeekStart = useMemo(
    () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    [],
  );
  const currentWeekEnd = useMemo(
    () => format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    [],
  );

  useEffect(() => {
    (async () => {
      const { data: depts } = await supabase.from("departments").select("id,name");
      const deptMap: Record<string, string> = {};
      (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });
      setDepartments(deptMap);
    })();
  }, []);

  const loadSaved = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("saved_weekly_workplans")
      .select("*")
      .order("week_start_date", { ascending: false });
    setSaved((data as SavedRow[]) ?? []);
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: wps } = await supabase
        .from("work_plans")
        .select("id,user_id,department_id,status,signature,submitted_at,week_start_date")
        .eq("week_start_date", currentWeekStart)
        .in("status", ["submitted", "approved"]);
      const rows = (wps as WPRow[]) ?? [];
      if (rows.length === 0) {
        setPlans([]);
        setLoading(false);
        return;
      }

      const planIds = rows.map((r) => r.id);
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const [{ data: items }, { data: profs }] = await Promise.all([
        supabase.from("work_plan_items").select("*").in("work_plan_id", planIds),
        supabase.from("profiles").select("id,full_name,position").in("id", userIds),
      ]);
      const profMap = new Map<string, { full_name: string; position: string | null }>();
      (profs ?? []).forEach((p: any) =>
        profMap.set(p.id, { full_name: p.full_name, position: p.position }),
      );
      const itemsByPlan = new Map<string, any[]>();
      (items ?? []).forEach((it: any) => {
        const arr = itemsByPlan.get(it.work_plan_id) ?? [];
        arr.push(it);
        itemsByPlan.set(it.work_plan_id, arr);
      });

      const built: DeptWorkPlanPDF[] = rows.map((r) => {
        const prof = profMap.get(r.user_id);
        const its = itemsByPlan.get(r.id) ?? [];
        return {
          departmentName: departments[r.department_id ?? ""] ?? "—",
          hodName: prof?.full_name ?? r.signature ?? "—",
          hodPosition: prof?.position ?? null,
          status: r.status,
          signature: r.signature,
          submittedAt: r.submitted_at,
          items: its.map((i: any) => ({
            activity_date: i.activity_date,
            activity: i.activity,
            location: i.location ?? null,
            needs_vehicle: !!i.needs_vehicle,
            needs_money: !!i.needs_money,
            money_amount: i.money_amount ?? null,
            notes: i.notes ?? null,
          })),
        };
      });
      built.sort((a, b) => a.departmentName.localeCompare(b.departmentName));
      setPlans(built);
      setLoading(false);
    })();
  }, [currentWeekStart, departments]);

  const handleDownload = () => {
    if (plans.length === 0) {
      toast.error("No submitted work plans for this week yet");
      return;
    }
    downloadAllDepartmentsWorkPlansPDF(plans, currentWeekStart);
  };

  const handleSaveAndDownload = async () => {
    if (plans.length === 0) {
      toast.error("No submitted work plans for this week yet");
      return;
    }
    setSaving(true);
    try {
      const { blob, filename } = buildAllDepartmentsWorkPlansPDF(plans, currentWeekStart);
      const path = `${currentWeekStart}/${Date.now()}-${filename}`;
      const { error: upErr } = await supabase.storage
        .from("workplan-pdfs")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any)
        .from("saved_weekly_workplans")
        .insert({
          week_start_date: currentWeekStart,
          week_end_date: currentWeekEnd,
          file_path: path,
          department_count: plans.length,
          generated_by: user?.id ?? null,
          generated_by_name: profile?.full_name ?? null,
        });
      if (insErr) throw insErr;

      // also trigger a local download for the user
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success("Saved to system & downloaded");
      loadSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save weekly PDF");
    } finally {
      setSaving(false);
    }
  };

  const downloadSaved = async (row: SavedRow) => {
    const { data, error } = await supabase.storage
      .from("workplan-pdfs")
      .createSignedUrl(row.file_path, 120);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Unable to fetch file");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const deleteSaved = async (row: SavedRow) => {
    if (!confirm("Delete this saved weekly PDF?")) return;
    await supabase.storage.from("workplan-pdfs").remove([row.file_path]);
    await (supabase as any).from("saved_weekly_workplans").delete().eq("id", row.id);
    toast.success("Deleted");
    loadSaved();
  };

  // Group saved PDFs by week (week_start_date) – they are already per-week
  const savedByWeek = useMemo(() => {
    const map = new Map<string, SavedRow[]>();
    for (const row of saved) {
      const key = row.week_start_date;
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [saved]);

  if (!canViewAll) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">All Workplans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All departments' submitted workplans grouped by week. The Diocesan Secretary can save the
          weekly consolidated PDF in the system for later access.
        </p>
      </div>

      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <ClipboardList className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <CardTitle className="font-serif">This week's workplans</CardTitle>
                <CardDescription>
                  Week of {format(parseISO(currentWeekStart), "EEE, MMM d")} –{" "}
                  {format(parseISO(currentWeekEnd), "EEE, MMM d, yyyy")}.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={plans.length === 0 || loading}
                onClick={handleDownload}
              >
                <Download className="mr-1 h-4 w-4" /> Download only
              </Button>
              <Button
                size="sm"
                disabled={plans.length === 0 || loading || saving}
                onClick={handleSaveAndDownload}
              >
                <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save & download"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {open && (
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No submitted work plans for this week yet.
              </p>
            ) : (
              <div className="space-y-2">
                {plans.map((p, idx) => (
                  <div key={idx} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{p.departmentName}</p>
                        <p className="text-xs text-muted-foreground">
                          HOD: {p.hodName}
                          {p.hodPosition ? ` (${p.hodPosition})` : ""} · {p.items.length} activit
                          {p.items.length === 1 ? "y" : "ies"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <FileText className="h-5 w-5" /> Saved weekly workplan PDFs
          </CardTitle>
          <CardDescription>
            Past weekly consolidated PDFs saved by the Diocesan Secretary. Grouped per week.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedByWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved weekly PDFs yet.</p>
          ) : (
            <div className="space-y-4">
              {savedByWeek.map(([weekStart, rows]) => {
                const ws = parseISO(weekStart);
                const we = addDays(ws, 6);
                return (
                  <div key={weekStart} className="rounded-md border border-border">
                    <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                      Week of {format(ws, "EEE, MMM d")} – {format(we, "EEE, MMM d, yyyy")}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({rows.length} PDF{rows.length === 1 ? "" : "s"} saved)
                      </span>
                    </div>
                    <ul className="divide-y">
                      {rows.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <div>
                            <p className="font-medium">{r.department_count} department{r.department_count === 1 ? "" : "s"}</p>
                            <p className="text-xs text-muted-foreground">
                              Saved {format(parseISO(r.created_at), "PPp")}
                              {r.generated_by_name ? ` by ${r.generated_by_name}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => downloadSaved(r)}>
                              <Download className="mr-1 h-4 w-4" /> Open
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteSaved(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
