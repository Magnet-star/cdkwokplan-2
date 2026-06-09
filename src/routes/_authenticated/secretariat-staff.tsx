import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Users } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/secretariat-staff")({
  component: SecretariatStaffPage,
});

interface StaffRow {
  id: string;
  department_id: string;
  full_name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
}
interface Dept { id: string; name: string; hod_id: string | null; }
interface Profile { id: string; full_name: string; email: string; position: string | null; phone: string | null; }

function SecretariatStaffPage() {
  const { isSuperAdmin, loading } = useAuth();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [hods, setHods] = useState<Record<string, Profile>>({});

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      const [{ data: d }, { data: s }] = await Promise.all([
        supabase.from("departments").select("id,name,hod_id").order("name"),
        (supabase as any).from("department_staff").select("*").order("full_name"),
      ]);
      const deptList = (d as Dept[]) ?? [];
      setDepts(deptList);
      setStaff((s as StaffRow[]) ?? []);
      const hodIds = deptList.map((x) => x.hod_id).filter(Boolean) as string[];
      if (hodIds.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,full_name,email,position,phone")
          .in("id", hodIds);
        const map: Record<string, Profile> = {};
        (ps as Profile[] | null)?.forEach((p) => { map[p.id] = p; });
        setHods(map);
      }
    })();
  }, [isSuperAdmin]);

  const grouped = useMemo(() => {
    return depts.map((d) => ({
      dept: d,
      hod: d.hod_id ? hods[d.hod_id] : null,
      members: staff.filter((s) => s.department_id === d.id),
    }));
  }, [depts, staff, hods]);

  const totalStaff = staff.length;

  const downloadPDF = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(102, 0, 0);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 248, 220);
    doc.setFont("times", "bold"); doc.setFontSize(18);
    doc.text("Catholic Diocese of Kitale", 14, 14);
    doc.setFont("times", "normal"); doc.setFontSize(11);
    doc.text("Secretariat Staff — All Departments", 14, 22);

    doc.setTextColor(40, 30, 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPp")}`, 14, 36);
    doc.text(`Departments: ${depts.length}  |  Total staff: ${totalStaff}`, 14, 42);

    let cursorY = 48;
    grouped.forEach(({ dept, hod, members }) => {
      const body: any[] = [];
      if (hod) {
        body.push([
          { content: "HOD", styles: { fontStyle: "bold", fillColor: [245, 230, 200] } },
          { content: hod.full_name, styles: { fontStyle: "bold", fillColor: [245, 230, 200] } },
          { content: hod.position ?? "Head of Department", styles: { fillColor: [245, 230, 200] } },
          { content: hod.phone ?? "—", styles: { fillColor: [245, 230, 200] } },
          { content: hod.email ?? "—", styles: { fillColor: [245, 230, 200] } },
        ]);
      }
      members.forEach((r, i) => {
        body.push([String(i + 1), r.full_name, r.title ?? "—", r.phone ?? "—", r.email ?? "—"]);
      });
      if (body.length === 0) {
        body.push([{ content: "No staff listed yet.", colSpan: 5, styles: { halign: "center", textColor: 120 } }]);
      }

      autoTable(doc, {
        startY: cursorY,
        head: [[{ content: `${dept.name}  (${members.length} staff${hod ? " + HOD" : ""})`, colSpan: 5, styles: { halign: "left", fillColor: [102, 0, 0], textColor: 255, fontStyle: "bold", fontSize: 11 } }],
               ["#", "Name", "Title", "Phone", "Email"]],
        body,
        styles: { fontSize: 9, cellPadding: 3, valign: "top", overflow: "linebreak" },
        headStyles: { fillColor: [120, 30, 30], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: 50, fontStyle: "bold" },
          2: { cellWidth: 42 },
          3: { cellWidth: 35 },
          4: { cellWidth: "auto" },
        },
        margin: { left: 14, right: 14 },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 6;
    });

    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Secretariat Staff — Page ${i} of ${pages}`,
        pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    }

    doc.save(`Secretariat_Staff_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isSuperAdmin) return <Navigate to="/dashboard" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Secretariat Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All staff submitted by Heads of Department, grouped by department.
          </p>
        </div>
        <Button onClick={downloadPDF}>
          <Download className="mr-2 h-4 w-4" /> Download PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Departments</p><p className="text-2xl font-semibold">{depts.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total staff</p><p className="text-2xl font-semibold">{totalStaff}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">HODs assigned</p><p className="text-2xl font-semibold">{Object.keys(hods).length}</p></CardContent></Card>
      </div>

      {grouped.map(({ dept, hod, members }) => (
        <Card key={dept.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Users className="h-5 w-5" /> {dept.name}
                </CardTitle>
                <CardDescription>{members.length} staff member{members.length === 1 ? "" : "s"}{hod ? " · HOD listed" : " · No HOD assigned"}</CardDescription>
              </div>
              <Badge variant="outline">{members.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-16">Role</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Phone</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {hod && (
                    <tr className="border-t bg-amber-50/60">
                      <td className="px-3 py-2"><Badge>HOD</Badge></td>
                      <td className="px-3 py-2 font-semibold">{hod.full_name}</td>
                      <td className="px-3 py-2">{hod.position ?? "Head of Department"}</td>
                      <td className="px-3 py-2">{hod.phone ? <a href={`tel:${hod.phone}`} className="text-primary hover:underline">{hod.phone}</a> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{hod.email ? <a href={`mailto:${hod.email}`} className="text-primary hover:underline">{hod.email}</a> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  )}
                  {members.length === 0 && !hod && (
                    <tr className="border-t"><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No staff listed yet.</td></tr>
                  )}
                  {members.map((r, i) => (
                    <tr key={r.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.full_name}</td>
                      <td className="px-3 py-2">{r.title ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{r.phone ? <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{r.email ? <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
