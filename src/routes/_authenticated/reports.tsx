import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { generateReportPDF } from "@/lib/report-pdf";
import { Download, FileBarChart, Upload, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek } from "date-fns";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function ReportsPage() {
  const { user, profile, isSuperAdmin, isProtectedSuperAdmin, isAdministrator, isHod } = useAuth();
  const now = new Date();
  const [period, setPeriod] = useState<"monthly" | "weekly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [weekStart, setWeekStart] = useState(() => format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [targetUserId, setTargetUserId] = useState<string>("self");
  const [people, setPeople] = useState<{ id: string; full_name: string; department_id: string | null; position: string | null }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; hod_id: string | null }[]>([]);
  const [hodByDept, setHodByDept] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Upload state
  const [uploadYear, setUploadYear] = useState(now.getFullYear());
  const [uploadMonth, setUploadMonth] = useState(now.getMonth());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedReports, setUploadedReports] = useState<any[]>([]);

  const loadUploaded = async () => {
    const { data } = await (supabase as any)
      .from("uploaded_reports")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .order("uploaded_at", { ascending: false });
    setUploadedReports((data as any[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: depts } = await supabase.from("departments").select("id,name,hod_id").order("name");
      setDepartments((depts as any) ?? []);
      const hodIds = ((depts as any) ?? []).map((d: any) => d.hod_id).filter(Boolean);
      const { data: allProfiles } = await supabase.from("profiles").select("id,full_name,department_id,position").order("full_name");
      const profiles = (allProfiles as any[]) ?? [];
      if (hodIds.length) {
        const map: Record<string, string> = {};
        ((depts as any) ?? []).forEach((d: any) => {
          if (d.hod_id) {
            const h = profiles.find((x) => x.id === d.hod_id);
            if (h) map[d.id] = h.full_name;
          }
        });
        setHodByDept(map);
      }
      if (isSuperAdmin || isHod) {
        setPeople(profiles);
      }
      await loadUploaded();
    })();
  }, [isSuperAdmin, isHod]);

  const handleDownload = async () => {
    if (!user || !profile) return;
    setBusy(true);
    try {
      const target = targetUserId === "self"
        ? { userId: user.id, fullName: profile.full_name, departmentId: profile.department_id, departmentName: departments.find((d) => d.id === profile.department_id)?.name ?? null, position: profile.position, hodName: profile.department_id ? (hodByDept[profile.department_id] ?? null) : null }
        : (() => {
            const p = people.find((x) => x.id === targetUserId)!;
            return { userId: p.id, fullName: p.full_name, departmentId: p.department_id, departmentName: departments.find((d) => d.id === p.department_id)?.name ?? null, position: p.position, hodName: p.department_id ? (hodByDept[p.department_id] ?? null) : null };
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !uploadFile) return;
    if (!profile.department_id) { toast.error("You must be assigned to a department before uploading."); return; }
    setUploading(true);
    try {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${uploadYear}-${String(uploadMonth + 1).padStart(2, "0")}_${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("uploaded-reports").upload(path, uploadFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: uploadFile.type || undefined,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("uploaded_reports").insert({
        user_id: user.id,
        department_id: profile.department_id,
        period_year: uploadYear,
        period_month: uploadMonth + 1,
        file_path: path,
        file_name: uploadFile.name,
        file_size: uploadFile.size,
        mime_type: uploadFile.type || null,
        notes: uploadNotes.trim() || null,
      });
      if (insErr) {
        await supabase.storage.from("uploaded-reports").remove([path]);
        throw insErr;
      }
      toast.success("Report uploaded");
      setUploadFile(null);
      setUploadNotes("");
      (document.getElementById("upload-file-input") as HTMLInputElement | null)?.value && ((document.getElementById("upload-file-input") as HTMLInputElement).value = "");
      await loadUploaded();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    }
    setUploading(false);
  };

  const downloadUploaded = async (row: any) => {
    const { data, error } = await supabase.storage.from("uploaded-reports").createSignedUrl(row.file_path, 60);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? "Could not get file"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const deleteUploaded = async (row: any) => {
    if (!confirm(`Delete uploaded report "${row.file_name}"?`)) return;
    await supabase.storage.from("uploaded-reports").remove([row.file_path]);
    const { error } = await (supabase as any).from("uploaded_reports").delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); await loadUploaded(); }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const userById = (id: string) => people.find((p) => p.id === id);
  const deptById = (id: string | null) => departments.find((d) => d.id === id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Auto-summarized from your weekly work plans, vehicle requests, and daily logs.</p>
      </div>

      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate">Generate PDF</TabsTrigger>
          {isHod && <TabsTrigger value="upload">Upload report</TabsTrigger>}
          <TabsTrigger value="uploaded">Uploaded reports</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="pt-4">
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
        </TabsContent>

        {isHod && (
          <TabsContent value="upload" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /> Upload external report</CardTitle>
                <CardDescription>Submit an external monthly report (PDF, Word, etc.) on behalf of your department. Visible to the super admin.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Month</Label>
                      <Select value={String(uploadMonth)} onValueChange={(v) => setUploadMonth(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Year</Label>
                      <Select value={String(uploadYear)} onValueChange={(v) => setUploadYear(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>File</Label>
                    <Input
                      id="upload-file-input"
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">PDF, Word, Excel or text files. Max 25 MB.</p>
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Textarea rows={2} value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Short description of what this report covers" />
                  </div>
                  <Button type="submit" disabled={uploading || !uploadFile}>
                    <Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading…" : "Upload report"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="uploaded" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Uploaded reports</CardTitle>
              <CardDescription>
                {isSuperAdmin
                  ? "All external reports uploaded by HODs across the diocese."
                  : isHod
                    ? "External reports your department has submitted."
                    : "External reports you have uploaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {uploadedReports.length === 0 && (
                <p className="text-sm text-muted-foreground">No uploaded reports yet.</p>
              )}
              {uploadedReports.map((r) => {
                const uploader = userById(r.user_id);
                const dept = deptById(r.department_id);
                const canDelete = isProtectedSuperAdmin || r.user_id === user?.id;
                return (
                  <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{r.file_name}</p>
                        <Badge variant="secondary">{MONTHS[r.period_month - 1]} {r.period_year}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Submitted by <strong>{uploader?.full_name ?? "—"}</strong> (HOD){dept ? ` · ${dept.name}` : ""} · {format(new Date(r.uploaded_at), "PPp")}
                      </p>
                      {r.notes && <p className="mt-1 text-xs italic">{r.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadUploaded(r)}>
                        <Download className="mr-1 h-3.5 w-3.5" /> Open
                      </Button>
                      {canDelete && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteUploaded(r)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
