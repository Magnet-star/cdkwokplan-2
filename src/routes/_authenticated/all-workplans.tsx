import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfWeek, parseISO, addDays } from "date-fns";
import { toast } from "sonner";
import { Download, ChevronDown, ChevronRight, ClipboardList, ChevronLeft, CalendarDays } from "lucide-react";
import {
  downloadAllDepartmentsWorkPlansPDF,
  type DeptWorkPlanPDF,
} from "@/lib/all-workplans-pdf";
import { getDiocesanSecretaryName } from "@/lib/diocesan-secretary.functions";

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

function AllWorkPlansPage() {
  const { canViewAll } = useAuth();
  const getSecretaryNameFn = useServerFn(getDiocesanSecretaryName);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<DeptWorkPlanPDF[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const todayWeekStart = useMemo(
    () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    [],
  );
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

  useEffect(() => {
    (async () => {
      const { data: depts } = await supabase.from("departments").select("id,name");
      const deptMap: Record<string, string> = {};
      (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });
      setDepartments(deptMap);
    })();
  }, []);

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

  const handleDownload = async () => {
    if (plans.length === 0) {
      toast.error("No submitted work plans for this week yet");
      return;
    }
    try {
      const diocesanSecretaryName = await getSecretaryNameFn();
      downloadAllDepartmentsWorkPlansPDF(plans, currentWeekStart, diocesanSecretaryName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download PDF");
    }
  };

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
          All departments' submitted workplans grouped by week. Download-only — PDFs are not saved
          to system storage.
        </p>
      </div>

      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <ClipboardList className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <CardTitle className="font-serif">
                  {isCurrentWeek ? "This week's workplans" : "Workplans for selected week"}
                </CardTitle>
                <CardDescription>
                  Week of {format(parseISO(currentWeekStart), "EEE, MMM d")} –{" "}
                  {format(parseISO(currentWeekEnd), "EEE, MMM d, yyyy")}
                  {!isCurrentWeek && (
                    <span className="ml-2 text-xs italic">(viewing another week)</span>
                  )}
                </CardDescription>
              </div>
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
              <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                disabled={plans.length === 0 || loading}
                onClick={handleDownload}
              >
                <Download className="mr-1 h-4 w-4" /> Download PDF
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
    </div>
  );
}
