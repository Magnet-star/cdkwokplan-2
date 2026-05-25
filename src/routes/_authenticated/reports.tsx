import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { generateReportPDF } from "@/lib/report-pdf";
import { Download, FileBarChart } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek } from "date-fns";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function ReportsPage() {
  const { user, profile, isSuperAdmin, isHod } = useAuth();
  const now = new Date();
  const [period, setPeriod] = useState<"monthly" | "weekly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [weekStart, setWeekStart] = useState(() => format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [targetUserId, setTargetUserId] = useState<string>("self");
  const [people, setPeople] = useState<{ id: string; full_name: string; department_id: string | null; position: string | null }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: depts } = await supabase.from("departments").select("id,name").order("name");
      setDepartments((depts as any) ?? []);
      if (isSuperAdmin || isHod) {
        const { data } = await supabase.from("profiles").select("id,full_name,department_id,position").order("full_name");
        setPeople((data as any) ?? []);
      }
    })();
  }, [isSuperAdmin, isHod]);

  const handleDownload = async () => {
    if (!user || !profile) return;
    setBusy(true);
    try {
      const target = targetUserId === "self"
        ? { userId: user.id, fullName: profile.full_name, departmentName: departments.find((d) => d.id === profile.department_id)?.name ?? null, position: profile.position }
        : (() => {
            const p = people.find((x) => x.id === targetUserId)!;
            return { userId: p.id, fullName: p.full_name, departmentName: departments.find((d) => d.id === p.department_id)?.name ?? null, position: p.position };
          })();
      if (period === "monthly") {
        await generateReportPDF(target, { kind: "monthly", year, monthIdx0: month });
      } else {
        await generateReportPDF(target, { kind: "weekly", weekStart: new Date(weekStart) });
      }
      toast.success("Report downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate");
    }
    setBusy(false);
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Auto-summarized from your weekly work plans, vehicle requests, and daily logs.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2"><FileBarChart className="h-5 w-5 text-primary" /> Generate report</CardTitle>
          <CardDescription>Choose a period and download a PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as "monthly" | "weekly")}>
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
            </TabsList>

            <TabsContent value="monthly" className="pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Month</Label>
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Year</Label>
                  <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="weekly" className="pt-4">
              <div>
                <Label>Week starting (Monday)</Label>
                <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Covers the 7 days from the chosen Monday.</p>
              </div>
            </TabsContent>
          </Tabs>

          {(isSuperAdmin || isHod) && people.length > 0 && (
            <div>
              <Label>Report for</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Myself</SelectItem>
                  {people
                    .filter((p) => isSuperAdmin || (isHod && p.department_id === profile?.department_id))
                    .filter((p) => p.id !== user?.id)
                    .map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleDownload} disabled={busy}>
            <Download className="mr-2 h-4 w-4" /> {busy ? "Generating…" : `Download ${period} PDF`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
