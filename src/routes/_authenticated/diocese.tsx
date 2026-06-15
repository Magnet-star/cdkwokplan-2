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
import { Pencil, Plus, Trash2, Download, Church, Phone, Hash, ChevronRight, ChevronDown, History } from "lucide-react";
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
  current_assignment: string | null;
  assignment_role: string | null;
  other_positions: string | null;
  phone_number: string | null;
}

interface AssignmentRow {
  id: string;
  clergy_id: string;
  parish: string | null;
  position: string;
  start_date: string | null;
  end_date: string | null;
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
  const { isSuperAdmin, canViewAll } = useAuth();
  const [leadership, setLeadership] = useState<LeadershipRow[]>([]);
  const [clergy, setClergy] = useState<ClergyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editLead, setEditLead] = useState<LeadershipRow | null>(null);
  const [creatingLead, setCreatingLead] = useState(false);
  const [editClergy, setEditClergy] = useState<ClergyRow | null>(null);
  const [creatingClergy, setCreatingClergy] = useState(false);
  const [initialClergySnapshot, setInitialClergySnapshot] = useState<string>("");

  const clergyIsDirty = () =>
    !!editClergy && JSON.stringify(editClergy) !== initialClergySnapshot;

  const closeClergyDialog = (force = false) => {
    if (!force && clergyIsDirty()) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setEditClergy(null);
    setCreatingClergy(false);
    setInitialClergySnapshot("");
  };

  const openClergyForEdit = (m: ClergyRow) => {
    setCreatingClergy(false);
    setEditClergy(m);
    setInitialClergySnapshot(JSON.stringify(m));
  };

  const load = async () => {
    setLoading(true);
    // Admins can read the base table (including phone numbers); everyone else
    // reads from the safe public view that excludes phone_number.
    const clergyQuery = canViewAll
      ? supabase.from("clergy_members").select("*").order("full_name")
      : supabase.from("clergy_members_public" as any).select("*").order("full_name");
    const [{ data: l }, { data: c }] = await Promise.all([
      supabase.from("diocese_leadership").select("*").order("sort_order"),
      clergyQuery,
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
      head: [["Name", "Category", "Home Parish", "Current Assignment", "Role", "Other Positions", "Phone"]],
      body: clergy.map((m) => [
        m.full_name,
        CATEGORY_LABEL[m.category] ?? m.category,
        m.home_parish ?? "",
        m.current_assignment ?? "",
        m.assignment_role ? (ROLE_LABEL[m.assignment_role] ?? m.assignment_role) : "",
        m.other_positions ?? "",
        m.phone_number ?? "",
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
    if (creatingLead) {
      const title = editLead.position_title.trim();
      if (!title) { toast.error("Position title is required"); return; }
      const key = (editLead.position_key || title)
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `pos_${Date.now()}`;
      const maxOrder = leadership.reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0);
      const { error } = await supabase.from("diocese_leadership").insert({
        position_key: key,
        position_title: title,
        holder_name: editLead.holder_name || null,
        notes: editLead.notes || null,
        sort_order: maxOrder + 10,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Leadership position added");
    } else {
      const { error } = await supabase
        .from("diocese_leadership")
        .update({
          position_title: editLead.position_title,
          holder_name: editLead.holder_name,
          notes: editLead.notes,
        })
        .eq("id", editLead.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Updated");
    }
    setEditLead(null);
    setCreatingLead(false);
    load();
  };

  const removeLeadership = async (id: string) => {
    if (!confirm("Remove this leadership position?")) return;
    const { error } = await supabase.from("diocese_leadership").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    load();
  };

  const startNewLeadership = () => {
    setCreatingLead(true);
    setEditLead({
      id: "",
      position_key: "",
      position_title: "",
      holder_name: "",
      notes: "",
      sort_order: 0,
    });
  };

  const saveClergy = async () => {
    if (!editClergy) return;
    const payload = {
      full_name: editClergy.full_name.trim(),
      category: editClergy.category,
      home_parish: editClergy.home_parish || null,
      current_assignment: editClergy.current_assignment || null,
      assignment_role: editClergy.assignment_role || null,
      other_positions: editClergy.other_positions || null,
      phone_number: editClergy.phone_number || null,
    };
    if (!payload.full_name) { toast.error("Name is required"); return; }
    const { error } = creatingClergy
      ? await supabase.from("clergy_members").insert(payload)
      : await supabase.from("clergy_members").update(payload).eq("id", editClergy.id);
    if (error) { toast.error(error.message); return; }
    toast.success(creatingClergy ? "Added" : "Updated");
    setEditClergy(null);
    setCreatingClergy(false);
    setInitialClergySnapshot("");
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
    const blank: ClergyRow = {
      id: "",
      full_name: "",
      category: "priest",
      home_parish: "",
      current_assignment: "",
      assignment_role: "",
      other_positions: "",
      phone_number: "",
    };
    setCreatingClergy(true);
    setEditClergy(blank);
    setInitialClergySnapshot(JSON.stringify(blank));
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
          {isSuperAdmin && (
            <div className="flex justify-end">
              <Button onClick={startNewLeadership} size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add leader
              </Button>
            </div>
          )}
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
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setCreatingLead(false); setEditLead(l); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeLeadership(l.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-10"><Hash className="h-3.5 w-3.5 inline" /></th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Home Parish</th>
                    <th className="px-3 py-2 text-left font-medium">Currently Serving</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className="px-3 py-2 text-left font-medium">Other Positions</th>
                    <th className="px-3 py-2 text-left font-medium">Phone Number</th>
                    {isSuperAdmin && <th className="px-3 py-2 text-right font-medium w-24">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {clergy.map((m, idx) => (
                    <tr key={m.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">{m.full_name}</td>
                      <td className="px-3 py-2">{m.home_parish ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{m.current_assignment ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">
                        {m.assignment_role ? (
                          <Badge variant="outline" className="text-xs">{ROLE_LABEL[m.assignment_role] ?? m.assignment_role}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{m.other_positions ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">
                        {m.phone_number ? (
                          <a href={`tel:${m.phone_number}`} className="text-primary hover:underline flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {m.phone_number}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openClergyForEdit(m)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => removeClergy(m.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit/create leadership dialog */}
      <Dialog open={!!editLead} onOpenChange={(o) => { if (!o) { setEditLead(null); setCreatingLead(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creatingLead ? "Add leadership position" : editLead?.position_title}</DialogTitle>
          </DialogHeader>
          {editLead && (
            <div className="space-y-3">
              {creatingLead && (
                <div className="space-y-1">
                  <Label>Position title *</Label>
                  <Input
                    value={editLead.position_title}
                    onChange={(e) => setEditLead({ ...editLead, position_title: e.target.value })}
                    placeholder="e.g. Vicar General, Chancellor, Director of Caritas"
                  />
                </div>
              )}
              {!creatingLead && (
                <div className="space-y-1">
                  <Label>Position title</Label>
                  <Input
                    value={editLead.position_title}
                    onChange={(e) => setEditLead({ ...editLead, position_title: e.target.value })}
                  />
                </div>
              )}
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
            <Button variant="outline" onClick={() => { setEditLead(null); setCreatingLead(false); }}>Cancel</Button>
            <Button onClick={saveLeadership}>{creatingLead ? "Add" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/create clergy dialog */}
      <Dialog open={!!editClergy} onOpenChange={(o) => { if (!o) closeClergyDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{creatingClergy ? "Add member" : "Edit member"}</DialogTitle></DialogHeader>
          {editClergy && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Full name *</Label>
                <Input value={editClergy.full_name} onChange={(e) => setEditClergy({ ...editClergy, full_name: e.target.value })} />
              </div>
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
                <Label>Phone number</Label>
                <Input value={editClergy.phone_number ?? ""} onChange={(e) => setEditClergy({ ...editClergy, phone_number: e.target.value })} placeholder="e.g. +254 712 345 678" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => closeClergyDialog()}>Cancel</Button>
            <Button onClick={saveClergy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
