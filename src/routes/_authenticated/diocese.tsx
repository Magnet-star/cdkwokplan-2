import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Download, Church } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/diocese")({
  component: DiocesePage,
});

interface LeadershipRow {
  id: string;
  position_key: string;
  position_title: string;
  holder_name: string | null;
  notes: string | null;
  sort_order: number;
}

interface ClergyRow {
  id: string;
  full_name: string;
  category: string;
  home_parish: string | null;
  ordination_date: string | null;
  current_assignment: string | null;
  assignment_role: string | null;
  other_positions: string | null;
  notes: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  priest: "Priest",
  religious_man: "Religious Man",
  religious_woman: "Religious Woman",
};

const ROLE_LABEL: Record<string, string> = {
  parish_priest: "Parish Priest",
  curate: "Curate",
  other: "Other",
};

function DiocesePage() {
  const { isSuperAdmin } = useAuth();
  const [leadership, setLeadership] = useState<LeadershipRow[]>([]);
  const [clergy, setClergy] = useState<ClergyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editLead, setEditLead] = useState<LeadershipRow | null>(null);
  const [editClergy, setEditClergy] = useState<ClergyRow | null>(null);
  const [creatingClergy, setCreatingClergy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: l }, { data: c }] = await Promise.all([
      supabase.from("diocese_leadership").select("*").order("sort_order"),
      supabase.from("clergy_members").select("*").order("full_name"),
    ]);
    setLeadership((l as any) ?? []);
    setClergy((c as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const downloadPDF = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(102, 0, 0);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 248, 220);
    doc.setFont("times", "bold"); doc.setFontSize(18);
    doc.text("Catholic Diocese of Kitale", 14, 14);
    doc.setFont("times", "normal"); doc.setFontSize(11);
    doc.text("Diocese at a Glance", 14, 22);

    doc.setTextColor(40, 30, 30);
    let y = 38;
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Diocesan Leadership", 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Position", "Holder", "Notes"]],
      body: leadership.map((l) => [l.position_title, l.holder_name ?? "—", l.notes ?? ""]),
      headStyles: { fillColor: [102, 0, 0], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Priests & Religious Men and Women", 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Name", "Category", "Home Parish", "Ordained", "Current Assignment", "Role", "Other Positions"]],
      body: clergy.map((m) => [
        m.full_name,
        CATEGORY_LABEL[m.category] ?? m.category,
        m.home_parish ?? "",
        m.ordination_date ? format(parseISO(m.ordination_date), "MMM yyyy") : "",
        m.current_assignment ?? "",
        m.assignment_role ? (ROLE_LABEL[m.assignment_role] ?? m.assignment_role) : "",
        m.other_positions ?? "",
      ]),
      headStyles: { fillColor: [102, 0, 0], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Generated ${format(new Date(), "PPp")} — Page ${i} of ${pages}`, 14, doc.internal.pageSize.getHeight() - 8);
    }
    doc.save(`Diocese_of_Kitale_At_a_Glance_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const saveLeadership = async () => {
    if (!editLead) return;
    const { error } = await supabase
      .from("diocese_leadership")
      .update({ holder_name: editLead.holder_name, notes: editLead.notes })
      .eq("id", editLead.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    setEditLead(null);
    load();
  };

  const saveClergy = async () => {
    if (!editClergy) return;
    const payload = {
      full_name: editClergy.full_name.trim(),
      category: editClergy.category,
      home_parish: editClergy.home_parish || null,
      ordination_date: editClergy.ordination_date || null,
      current_assignment: editClergy.current_assignment || null,
      assignment_role: editClergy.assignment_role || null,
      other_positions: editClergy.other_positions || null,
      notes: editClergy.notes || null,
    };
    if (!payload.full_name) { toast.error("Name is required"); return; }
    const { error } = creatingClergy
      ? await supabase.from("clergy_members").insert(payload)
      : await supabase.from("clergy_members").update(payload).eq("id", editClergy.id);
    if (error) { toast.error(error.message); return; }
    toast.success(creatingClergy ? "Added" : "Updated");
    setEditClergy(null);
    setCreatingClergy(false);
    load();
  };

  const removeClergy = async (id: string) => {
    if (!confirm("Remove this entry?")) return;
    const { error } = await supabase.from("clergy_members").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    load();
  };

  const startNewClergy = () => {
    setCreatingClergy(true);
    setEditClergy({
      id: "",
      full_name: "",
      category: "priest",
      home_parish: "",
      ordination_date: "",
      current_assignment: "",
      assignment_role: "",
      other_positions: "",
      notes: "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}>
            <Church className="h-6 w-6" /> Diocese at a Glance
          </h1>
          <p className="text-sm text-muted-foreground">Leadership, clergy and religious of the Catholic Diocese of Kitale.</p>
        </div>
        <Button onClick={downloadPDF} variant="outline">
          <Download className="mr-2 h-4 w-4" /> Download PDF
        </Button>
      </div>

      <Tabs defaultValue="leadership">
        <TabsList>
          <TabsTrigger value="leadership">Leadership</TabsTrigger>
          <TabsTrigger value="clergy">Priests & Religious</TabsTrigger>
        </TabsList>

        <TabsContent value="leadership" className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            leadership.map((l) => (
              <Card key={l.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">{l.position_title}</CardTitle>
                    <CardDescription>{l.holder_name || <em className="text-muted-foreground">Not filled</em>}</CardDescription>
                  </div>
                  {isSuperAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => setEditLead(l)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                {l.notes && (
                  <CardContent className="pt-0 text-sm text-muted-foreground whitespace-pre-wrap">{l.notes}</CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="clergy" className="space-y-3">
          {isSuperAdmin && (
            <div className="flex justify-end">
              <Button onClick={startNewClergy} size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add member
              </Button>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : clergy.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clergy or religious members listed yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {clergy.map((m) => (
                <Card key={m.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base">{m.full_name}</CardTitle>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary">{CATEGORY_LABEL[m.category] ?? m.category}</Badge>
                        {m.assignment_role && <Badge variant="outline">{ROLE_LABEL[m.assignment_role] ?? m.assignment_role}</Badge>}
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setCreatingClergy(false); setEditClergy(m); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeClergy(m.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-1 pt-0 text-sm">
                    {m.home_parish && <p><span className="font-semibold">Home parish:</span> {m.home_parish}</p>}
                    {m.ordination_date && <p><span className="font-semibold">Ordained:</span> {format(parseISO(m.ordination_date), "PPP")}</p>}
                    {m.current_assignment && <p><span className="font-semibold">Currently serving:</span> {m.current_assignment}</p>}
                    {m.other_positions && <p><span className="font-semibold">Other positions:</span> {m.other_positions}</p>}
                    {m.notes && <p className="text-muted-foreground whitespace-pre-wrap">{m.notes}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit leadership dialog */}
      <Dialog open={!!editLead} onOpenChange={(o) => !o && setEditLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editLead?.position_title}</DialogTitle></DialogHeader>
          {editLead && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Holder name</Label>
                <Input value={editLead.holder_name ?? ""} onChange={(e) => setEditLead({ ...editLead, holder_name: e.target.value })} placeholder="e.g. Rt. Rev. John Doe" />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea value={editLead.notes ?? ""} onChange={(e) => setEditLead({ ...editLead, notes: e.target.value })} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLead(null)}>Cancel</Button>
            <Button onClick={saveLeadership}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/create clergy dialog */}
      <Dialog open={!!editClergy} onOpenChange={(o) => { if (!o) { setEditClergy(null); setCreatingClergy(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{creatingClergy ? "Add member" : "Edit member"}</DialogTitle></DialogHeader>
          {editClergy && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Full name *</Label>
                <Input value={editClergy.full_name} onChange={(e) => setEditClergy({ ...editClergy, full_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={editClergy.category} onValueChange={(v) => setEditClergy({ ...editClergy, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priest">Priest</SelectItem>
                      <SelectItem value="religious_man">Religious Man</SelectItem>
                      <SelectItem value="religious_woman">Religious Woman</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Ordination date</Label>
                  <Input type="date" value={editClergy.ordination_date ?? ""} onChange={(e) => setEditClergy({ ...editClergy, ordination_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Home parish</Label>
                <Input value={editClergy.home_parish ?? ""} onChange={(e) => setEditClergy({ ...editClergy, home_parish: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Current assignment (parish)</Label>
                  <Input value={editClergy.current_assignment ?? ""} onChange={(e) => setEditClergy({ ...editClergy, current_assignment: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={editClergy.assignment_role ?? ""} onValueChange={(v) => setEditClergy({ ...editClergy, assignment_role: v })}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parish_priest">Parish Priest</SelectItem>
                      <SelectItem value="curate">Curate</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Other diocesan positions</Label>
                <Input value={editClergy.other_positions ?? ""} onChange={(e) => setEditClergy({ ...editClergy, other_positions: e.target.value })} placeholder="e.g. Chancellor, Dean of Studies" />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea value={editClergy.notes ?? ""} onChange={(e) => setEditClergy({ ...editClergy, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditClergy(null); setCreatingClergy(false); }}>Cancel</Button>
            <Button onClick={saveClergy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
