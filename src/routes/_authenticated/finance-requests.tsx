import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Banknote, Plus, Trash2, Download, Send, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { downloadFinanceRequestPDF, type FinanceRequestPDFData } from "@/lib/finance-request-pdf";

export const Route = createFileRoute("/_authenticated/finance-requests")({
  component: FinanceRequestsPage,
});

interface ItemRow { activity: string; amount: string; }

interface FRRow {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_signature: string;
  mpesa_phone: string | null;
  department_id: string | null;
  department_name: string | null;
  items: ItemRow[];
  total_amount: number;
  selected_super_admin_id: string;
  selected_super_admin_name: string | null;
  status: "pending" | "approved" | "rejected" | "adjustment_requested";
  submitted_at: string;
  finance_admin_name: string | null;
  finance_admin_decision: string | null;
  finance_admin_note: string | null;
  finance_admin_at: string | null;
  vicar_general_name: string | null;
  vicar_general_decision: string | null;
  vicar_general_note: string | null;
  vicar_general_at: string | null;
  procurator_name: string | null;
  procurator_decision: string | null;
  procurator_note: string | null;
  procurator_at: string | null;
}

interface SuperAdminOption { id: string; full_name: string; }

const emptyItem = (): ItemRow => ({ activity: "", amount: "" });

function FinanceRequestsPage() {
  const { user, profile, roles } = useAuth();
  const isHod = roles.includes("hod");
  const isApprover =
    roles.includes("finance_admin") ||
    roles.includes("vicar_general") ||
    roles.includes("procurator");

  const [requests, setRequests] = useState<FRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminOption[]>([]);
  const [departmentName, setDepartmentName] = useState<string>("");

  // form state
  const [items, setItems] = useState<ItemRow[]>([emptyItem(), emptyItem(), emptyItem(), emptyItem(), emptyItem()]);
  const [signature, setSignature] = useState("");
  const [mpesa, setMpesa] = useState("");
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(
    () => items.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [items],
  );

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("finance_requests")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setRequests([]);
    } else {
      setRequests((data ?? []) as unknown as FRRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    void (async () => {
      // load super admins
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");
      const ids = (roleRows ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        setSuperAdmins(((profs ?? []) as { id: string; full_name: string }[]).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      }
      // load department name from profile
      if (profile?.department_id) {
        const { data: dept } = await supabase
          .from("departments")
          .select("name")
          .eq("id", profile.department_id)
          .maybeSingle();
        if (dept) setDepartmentName((dept as { name: string }).name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.department_id]);

  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ItemRow, v: string) =>
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [field]: v } : it)));

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const cleaned = items.filter((i) => i.activity.trim() !== "" && Number(i.amount) > 0);
    if (cleaned.length === 0) {
      toast.error("Add at least one item with an amount");
      return;
    }
    if (!signature.trim()) {
      toast.error("Please type your name to sign");
      return;
    }
    if (!selectedAdminId) {
      toast.error("Please select a Super Admin recipient");
      return;
    }
    setSubmitting(true);
    const adminName = superAdmins.find((s) => s.id === selectedAdminId)?.full_name ?? null;
    const { error } = await supabase.from("finance_requests").insert({
      requester_id: user.id,
      requester_name: profile.full_name,
      requester_signature: signature.trim(),
      mpesa_phone: mpesa.trim() || null,
      department_id: profile.department_id,
      department_name: departmentName || null,
      items: cleaned.map((i) => ({ activity: i.activity.trim(), amount: Number(i.amount) || 0 })),
      total_amount: cleaned.reduce((s, i) => s + (Number(i.amount) || 0), 0),
      selected_super_admin_id: selectedAdminId,
      selected_super_admin_name: adminName,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Finance request submitted");
    setItems([emptyItem(), emptyItem(), emptyItem(), emptyItem(), emptyItem()]);
    setSignature("");
    setMpesa("");
    setSelectedAdminId("");
    void refresh();
  };

  const toPDFData = (r: FRRow): FinanceRequestPDFData => ({
    id: r.id,
    requester_name: r.requester_name,
    requester_signature: r.requester_signature,
    mpesa_phone: r.mpesa_phone,
    department_name: r.department_name,
    items: r.items ?? [],
    total_amount: Number(r.total_amount) || 0,
    submitted_at: r.submitted_at,
    selected_super_admin_name: r.selected_super_admin_name,
    status: r.status,
    finance_admin_name: r.finance_admin_name,
    finance_admin_decision: r.finance_admin_decision,
    finance_admin_note: r.finance_admin_note,
    finance_admin_at: r.finance_admin_at,
    vicar_general_name: r.vicar_general_name,
    vicar_general_decision: r.vicar_general_decision,
    vicar_general_note: r.vicar_general_note,
    vicar_general_at: r.vicar_general_at,
    procurator_name: r.procurator_name,
    procurator_decision: r.procurator_decision,
    procurator_note: r.procurator_note,
    procurator_at: r.procurator_at,
  });

  const myRequests = requests.filter((r) => r.requester_id === user?.id);
  const incomingRequests = requests.filter((r) => r.requester_id !== user?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#660000] text-white">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Finance Requests</h1>
          <p className="text-sm text-muted-foreground">Submit funding requests and track approvals.</p>
        </div>
      </div>

      {isHod && (
        <Card>
          <CardHeader>
            <CardTitle>New finance request</CardTitle>
            <CardDescription>
              Requested by <strong>{profile?.full_name ?? "—"}</strong>
              {departmentName && <> · Department: <strong>{departmentName}</strong></>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitRequest} className="space-y-5">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="w-12 p-2 text-left">#</th>
                      <th className="p-2 text-left">Item / Activity</th>
                      <th className="w-44 p-2 text-left">Amount (KES)</th>
                      <th className="w-12 p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">
                          <Input
                            value={it.activity}
                            onChange={(e) => updateItem(i, "activity", e.target.value)}
                            placeholder="Describe the item or activity"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.amount}
                            onChange={(e) => updateItem(i, "amount", e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-2">
                          {items.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/40">
                      <td colSpan={2} className="p-2 text-right font-bold">TOTAL</td>
                      <td className="p-2 font-bold">KES {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-4 w-4" /> Add another item
              </Button>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Signed by (type your name) *</Label>
                  <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full name as signature" required />
                </div>
                <div>
                  <Label>Date & time (auto)</Label>
                  <Input value={format(new Date(), "PPpp")} readOnly disabled />
                </div>
                <div>
                  <Label>M-Pesa phone (in case funds are sent to you)</Label>
                  <Input value={mpesa} onChange={(e) => setMpesa(e.target.value)} placeholder="e.g. 0712 345 678" />
                </div>
                <div>
                  <Label>Send to Super Admin *</Label>
                  <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
                    <SelectTrigger><SelectValue placeholder="Select super admin recipient" /></SelectTrigger>
                    <SelectContent>
                      {superAdmins.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" disabled={submitting}>
                <Send className="mr-1 h-4 w-4" /> {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My finance requests</CardTitle>
          <CardDescription>Requests you have submitted. Track approvals here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && myRequests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {myRequests.map((r) => (
            <RequestCard key={r.id} r={r} toPDFData={toPDFData} canAct={false} onChanged={refresh} />
          ))}
        </CardContent>
      </Card>

      {(isApprover || incomingRequests.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {isApprover ? "Requests awaiting your decision" : "Requests sent to you"}
            </CardTitle>
            <CardDescription>
              {isApprover
                ? "As an approver you can approve, reject, or request a budget adjustment."
                : "Requests sent to you by HODs."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {incomingRequests.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
            {incomingRequests.map((r) => (
              <RequestCard key={r.id} r={r} toPDFData={toPDFData} canAct={isApprover} onChanged={refresh} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function statusBadge(s: FRRow["status"]) {
  const map: Record<FRRow["status"], { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-amber-100 text-amber-900 border-amber-300" },
    approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
    rejected: { label: "Rejected", cls: "bg-red-100 text-red-900 border-red-300" },
    adjustment_requested: { label: "Adjustment requested", cls: "bg-blue-100 text-blue-900 border-blue-300" },
  };
  const m = map[s];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

function RequestCard({
  r,
  toPDFData,
  canAct,
  onChanged,
}: {
  r: FRRow;
  toPDFData: (r: FRRow) => FinanceRequestPDFData;
  canAct: boolean;
  onChanged: () => void;
}) {
  const { user, profile, roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { decision: "approve" | "reject" | "adjust" }>(null);
  const [signName, setSignName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // determine which approver column to use, based on the acting user's roles
  const approverRole: "finance_admin" | "vicar_general" | "procurator" | null =
    roles.includes("finance_admin")
      ? "finance_admin"
      : roles.includes("vicar_general")
        ? "vicar_general"
        : roles.includes("procurator")
          ? "procurator"
          : null;

  const submitDecision = async () => {
    if (!user || !approverRole || !dialog) return;
    if (!signName.trim()) {
      toast.error("Please type your name to sign");
      return;
    }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const prefix = approverRole;
    const decisionValue = dialog.decision === "approve" ? "approved" : dialog.decision === "reject" ? "rejected" : "adjustment_requested";
    const update: Record<string, unknown> = {
      [`${prefix}_id`]: user.id,
      [`${prefix}_name`]: signName.trim(),
      [`${prefix}_decision`]: decisionValue,
      [`${prefix}_note`]: note.trim() || null,
      [`${prefix}_at`]: nowIso,
    };
    // overall status: rejected/adjustment short-circuit; approved if all 3 present approve
    if (dialog.decision === "reject") update.status = "rejected";
    else if (dialog.decision === "adjust") update.status = "adjustment_requested";
    else {
      const after = {
        finance_admin_decision: r.finance_admin_decision,
        vicar_general_decision: r.vicar_general_decision,
        procurator_decision: r.procurator_decision,
        [`${prefix}_decision`]: "approved",
      };
      if (
        after.finance_admin_decision === "approved" &&
        after.vicar_general_decision === "approved" &&
        after.procurator_decision === "approved"
      ) update.status = "approved";
    }
    const { error } = await supabase.from("finance_requests").update(update as never).eq("id", r.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Decision recorded");
    setDialog(null);
    setSignName("");
    setNote("");
    onChanged();
  };

  const isMine = r.requester_id === user?.id;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{r.department_name ?? "—"} — KES {Number(r.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">
            By {r.requester_name} · {format(new Date(r.submitted_at), "PPp")}
          </p>
          <p className="text-xs text-muted-foreground">Sent to: {r.selected_super_admin_name ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(r.status)}
          <Button size="sm" variant="outline" onClick={() => downloadFinanceRequestPDF(toPDFData(r))}>
            <Download className="mr-1 h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Details"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-md border">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Item / Activity</th><th className="p-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {(r.items ?? []).map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2">{it.activity}</td>
                    <td className="p-2 text-right">KES {Number(it.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/40">
                  <td colSpan={2} className="p-2 text-right font-bold">TOTAL</td>
                  <td className="p-2 text-right font-bold">KES {Number(r.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
            <div>Signed: <strong className="text-foreground">{r.requester_signature}</strong></div>
            <div>M-Pesa: <strong className="text-foreground">{r.mpesa_phone ?? "—"}</strong></div>
            <div>Submitted: <strong className="text-foreground">{format(new Date(r.submitted_at), "PPpp")}</strong></div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ApprovalBlock title="Finance Administrator" name={r.finance_admin_name} decision={r.finance_admin_decision} at={r.finance_admin_at} note={r.finance_admin_note} />
            <ApprovalBlock title="Vicar General" name={r.vicar_general_name} decision={r.vicar_general_decision} at={r.vicar_general_at} note={r.vicar_general_note} />
            <ApprovalBlock title="Procurator" name={r.procurator_name} decision={r.procurator_decision} at={r.procurator_at} note={r.procurator_note} />
          </div>

          {canAct && !isMine && approverRole && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button size="sm" onClick={() => { setDialog({ decision: "approve" }); setSignName(profile?.full_name ?? ""); }}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { setDialog({ decision: "reject" }); setSignName(profile?.full_name ?? ""); }}>
                <XCircle className="mr-1 h-4 w-4" /> Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setDialog({ decision: "adjust" }); setSignName(profile?.full_name ?? ""); }}>
                <RefreshCw className="mr-1 h-4 w-4" /> Ask for budget adjustment
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.decision === "approve" ? "Approve request" : dialog?.decision === "reject" ? "Reject request" : "Request budget adjustment"}
            </DialogTitle>
            <DialogDescription>
              Sign by typing your full name. {dialog?.decision !== "approve" && "Please add a note explaining your decision."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Your name (signature) *</Label>
              <Input value={signName} onChange={(e) => setSignName(e.target.value)} />
            </div>
            <div>
              <Label>Note {dialog?.decision !== "approve" && "*"}</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / details" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={submitDecision} disabled={saving || (dialog?.decision !== "approve" && !note.trim())}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApprovalBlock({
  title, name, decision, at, note,
}: { title: string; name: string | null; decision: string | null; at: string | null; note: string | null }) {
  return (
    <div className="rounded-md border p-3 text-xs">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">Name: <span className="font-medium">{name ?? "— pending —"}</span></p>
      <p>Decision: <span className="font-medium">{decision ? decision.replace("_", " ") : "— pending —"}</span></p>
      <p>Date: <span className="font-medium">{at ? format(new Date(at), "PPp") : "—"}</span></p>
      {note && <p className="mt-1 text-muted-foreground">Note: {note}</p>}
    </div>
  );
}
