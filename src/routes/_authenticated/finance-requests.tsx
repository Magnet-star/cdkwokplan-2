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
import {
  format, startOfDay, startOfWeek, startOfMonth, startOfYear, endOfDay, endOfWeek, endOfMonth, endOfYear, isWithinInterval,
} from "date-fns";
import { Banknote, Plus, Trash2, Download, Send, CheckCircle2, XCircle, RefreshCw, Pencil, Ban, ChevronDown, ChevronUp } from "lucide-react";
import { downloadFinanceRequestPDF, type FinanceRequestPDFData } from "@/lib/finance-request-pdf";
import { downloadFinanceSummaryPDF } from "@/lib/finance-summary-pdf";

export const Route = createFileRoute("/_authenticated/finance-requests")({
  component: FinanceRequestsPage,
});

interface ItemRow { activity: string; amount: string; activity_date: string; }
type FRStatus = "pending" | "approved" | "rejected" | "adjustment_requested" | "cancelled";

interface FRRow {
  id: string;
  serial_number: string | null;
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
  vicar_super_admin_id: string | null;
  vicar_super_admin_name: string | null;
  procurator_super_admin_id: string | null;
  procurator_super_admin_name: string | null;
  status: FRStatus;
  submitted_at: string;
  finance_admin_name: string | null; finance_admin_decision: string | null; finance_admin_note: string | null; finance_admin_at: string | null;
  vicar_general_name: string | null; vicar_general_decision: string | null; vicar_general_note: string | null; vicar_general_at: string | null;
  procurator_name: string | null; procurator_decision: string | null; procurator_note: string | null; procurator_at: string | null;
  accounts_disbursement_status: string | null;
  accounts_disbursement_by: string | null;
  accounts_disbursement_name: string | null;
  accounts_disbursement_at: string | null;
  accounts_disbursement_note: string | null;
}

interface SuperAdminOption { id: string; full_name: string; }
type CdkOffice = "finance" | "vicar" | "procurator";
interface CdkRecipients {
  finance: SuperAdminOption | null;
  vicar: SuperAdminOption | null;
  procurator: SuperAdminOption | null;
  accounts: SuperAdminOption | null;
}

const emptyItem = (): ItemRow => ({ activity: "", amount: "", activity_date: "" });

type Period = "day" | "week" | "month" | "year" | "all";

function rangeFor(period: Period, ref = new Date()) {
  switch (period) {
    case "day": return { start: startOfDay(ref), end: endOfDay(ref), label: format(ref, "PP") };
    case "week": {
      const s = startOfWeek(ref, { weekStartsOn: 1 });
      const e = endOfWeek(ref, { weekStartsOn: 1 });
      return { start: s, end: e, label: `${format(s, "PP")} – ${format(e, "PP")}` };
    }
    case "month": return { start: startOfMonth(ref), end: endOfMonth(ref), label: format(ref, "MMMM yyyy") };
    case "year": return { start: startOfYear(ref), end: endOfYear(ref), label: format(ref, "yyyy") };
    case "all": return { start: new Date(0), end: new Date(8640000000000000), label: "All time" };
  }
}

function fmtKES(n: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 }).format(n || 0);
}

function FinanceRequestsPage() {
  const { user, profile, roles, isSuperAdmin, isAdministrator } = useAuth();
  const isHod = roles.includes("hod") || isSuperAdmin || isAdministrator; // super admin / administrator can also submit for their department
  const isApprover =
    isSuperAdmin ||
    roles.includes("finance_admin") ||
    roles.includes("vicar_general") ||
    roles.includes("procurator");
  // CDK ACCOUNTS (administrator role) is a viewer office that observes and
  // downloads fully-authorized requests, but never approves/authorizes.
  const isAccountsViewer = isAdministrator && !isSuperAdmin;

  const [requests, setRequests] = useState<FRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<CdkRecipients>({ finance: null, vicar: null, procurator: null, accounts: null });
  const [departmentName, setDepartmentName] = useState<string>("");

  // form state
  const [items, setItems] = useState<ItemRow[]>([emptyItem(), emptyItem(), emptyItem(), emptyItem(), emptyItem()]);
  const [signature, setSignature] = useState("");
  const [mpesa, setMpesa] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // What CDK office is the current user (if super admin) part of?
  const cdkOffice: CdkOffice | null = useMemo(() => {
    // Resolve based on the signed-in account name FIRST (e.g. "CDK PROCURATOR",
    // "VICAR GENERAL", "CDK FINANCE") because departments can be shared
    // (e.g. the Procurator account sits under the Finance department), which
    // would otherwise misroute approvals to the Finance Administrator slot.
    const name = (profile?.full_name ?? "").toLowerCase();
    if (/procurator/.test(name)) return "procurator";
    if (/vicar/.test(name)) return "vicar";
    if (/cdk\s*finance|finance\s*admin/.test(name)) return "finance";
    // Fall back to department name, again checking the more-specific offices first.
    const n = (departmentName ?? "").toLowerCase();
    if (/procurator/.test(n)) return "procurator";
    if (/vicar/.test(n)) return "vicar";
    if (/finance/.test(n)) return "finance";
    return null;
  }, [profile?.full_name, departmentName]);

  // Only CDK Finance / Vicar General / Procurator super admins see the incoming approval section.
  // CDK ACCOUNTS (administrator role) also sees incoming requests so they can
  // download fully-authorized ones for processing.
  const canSeeIncoming = (isSuperAdmin && cdkOffice !== null)
    || roles.includes("finance_admin")
    || roles.includes("vicar_general")
    || roles.includes("procurator")
    || isAccountsViewer;

  // tab for super-admin: their own vs incoming
  const [tab, setTab] = useState<"incoming" | "mine">(canSeeIncoming ? "incoming" : "mine");
  useEffect(() => {
    if (canSeeIncoming) setTab((t) => t);
    else setTab("mine");
  }, [canSeeIncoming]);

  const total = useMemo(() => items.reduce((s, i) => s + (Number(i.amount) || 0), 0), [items]);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("finance_requests")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) { toast.error(error.message); setRequests([]); }
    else setRequests((data ?? []) as unknown as FRRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    void (async () => {
      const next: CdkRecipients = { finance: null, vicar: null, procurator: null, accounts: null };
      const { data: rpcRows, error: rpcErr } = await supabase.rpc("get_super_admin_recipients");
      if (rpcErr) console.warn("get_super_admin_recipients failed", rpcErr);
      const profRows = ((rpcRows ?? []) as { id: string; full_name: string; department_name: string | null }[]);
      const pick = (re: RegExp) => {
        const p = profRows.find((row) => re.test(row.full_name || ""))
          ?? profRows.find((row) => re.test(row.department_name || ""));
        return p ? { id: p.id, full_name: p.full_name } : null;
      };
      // Match by account name first (e.g. "CDK FINANCE", "VICAR GENERAL", "CDK PROCURATOR"),
      // then fall back to department name. Procurator is picked before finance so that
      // "CDK PROCURATOR" isn't mis-matched to the Finance department by the /finance/ regex.
      next.procurator = pick(/procurator/i);
      next.vicar = pick(/vicar/i);
      const financePool = profRows.filter((row) => row.id !== next.procurator?.id && row.id !== next.vicar?.id);
      const fin = financePool.find((row) => /finance/i.test(row.full_name || ""))
        ?? financePool.find((row) => /finance/i.test(row.department_name || ""));
      next.finance = fin ? { id: fin.id, full_name: fin.full_name } : null;
      // CDK Accounts (administrator role) — fetched from a separate RPC since
      // they are not super admins. Picked first by name match, then dept.
      const { data: accRows } = await supabase.rpc("get_accounts_recipients");
      const accProfRows = ((accRows ?? []) as { id: string; full_name: string; department_name: string | null }[]);
      const acc = accProfRows.find((row) => /accounts/i.test(row.full_name || ""))
        ?? accProfRows.find((row) => /accounts/i.test(row.department_name || ""))
        ?? accProfRows[0];
      next.accounts = acc ? { id: acc.id, full_name: acc.full_name } : null;
      setRecipients(next);
      if (profile?.department_id) {
        const { data: dept } = await supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle();
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
    if (cleaned.length === 0) return toast.error("Add at least one item with an amount");
    if (!signature.trim()) return toast.error("Please type your name to sign");
    if (!recipients.finance) return toast.error("No CDK Finance super admin is configured. Contact the administrator.");
    setSubmitting(true);
    const { error } = await supabase.from("finance_requests").insert({
      requester_id: user.id,
      requester_name: profile.full_name,
      requester_signature: signature.trim(),
      mpesa_phone: mpesa.trim() || null,
      department_id: profile.department_id,
      department_name: departmentName || null,
      items: cleaned.map((i) => ({ activity: i.activity.trim(), amount: Number(i.amount) || 0, activity_date: i.activity_date || null })),
      total_amount: cleaned.reduce((s, i) => s + (Number(i.amount) || 0), 0),
      selected_super_admin_id: recipients.finance.id,
      selected_super_admin_name: recipients.finance.full_name,
      vicar_super_admin_id: recipients.vicar?.id ?? null,
      vicar_super_admin_name: recipients.vicar?.full_name ?? null,
      procurator_super_admin_id: recipients.procurator?.id ?? null,
      procurator_super_admin_name: recipients.procurator?.full_name ?? null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Finance request submitted to CDK Finance, Vicar General and Procurator");
    setItems([emptyItem(), emptyItem(), emptyItem(), emptyItem(), emptyItem()]);
    setSignature(""); setMpesa("");
    void refresh();
  };

  const toPDFData = (r: FRRow): FinanceRequestPDFData => ({
    id: r.id, serial_number: r.serial_number, requester_name: r.requester_name, requester_signature: r.requester_signature,
    mpesa_phone: r.mpesa_phone, department_name: r.department_name, items: r.items ?? [],
    total_amount: Number(r.total_amount) || 0, submitted_at: r.submitted_at,
    selected_super_admin_name: [r.selected_super_admin_name, r.vicar_super_admin_name, r.procurator_super_admin_name].filter(Boolean).join(", ") || null,
    status: r.status,
    finance_admin_name: r.finance_admin_name, finance_admin_decision: r.finance_admin_decision, finance_admin_note: r.finance_admin_note, finance_admin_at: r.finance_admin_at,
    vicar_general_name: r.vicar_general_name, vicar_general_decision: r.vicar_general_decision, vicar_general_note: r.vicar_general_note, vicar_general_at: r.vicar_general_at,
    procurator_name: r.procurator_name, procurator_decision: r.procurator_decision, procurator_note: r.procurator_note, procurator_at: r.procurator_at,
  });

  const myRequests = requests.filter((r) => r.requester_id === user?.id);
  const incomingRequests = requests.filter((r) => r.requester_id !== user?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#660000] text-white"><Banknote className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold">Finance Requests</h1>
          <p className="text-sm text-muted-foreground">Submit funding requests and track approvals.</p>
        </div>
      </div>

      {(isSuperAdmin || canSeeIncoming) && (
        <div className="flex flex-wrap gap-2">
          {canSeeIncoming && (
            <Button variant={tab === "incoming" ? "default" : "outline"} size="sm" onClick={() => setTab("incoming")}>Incoming for approval</Button>
          )}
          <Button variant={tab === "mine" ? "default" : "outline"} size="sm" onClick={() => setTab("mine")}>My department request</Button>
        </div>
      )}

      {/* HOD / Super Admin submitter view */}
      {isHod && (!canSeeIncoming || tab === "mine") && (
        <>
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
                {/* Mobile: stacked editor so each field has its own clear area */}
                <div className="space-y-3 sm:hidden">
                  {items.map((it, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">Item #{i + 1}</span>
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Item / Activity</Label>
                        <Textarea
                          rows={2}
                          value={it.activity}
                          onChange={(e) => updateItem(i, "activity", e.target.value)}
                          placeholder="Describe the item or activity"
                          className="min-h-[60px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Activity date</Label>
                        <Input
                          type="date"
                          value={it.activity_date}
                          onChange={(e) => updateItem(i, "activity_date", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Amount (KES)</Label>
                        <Input
                          inputMode="decimal"
                          value={it.amount}
                          onChange={(e) => updateItem(i, "amount", e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
                    <span className="font-bold">Tot</span>
                    <span className="font-bold">{fmtKES(total)}</span>
                  </div>
                </div>

                {/* Desktop/tablet: table layout */}
                <div className="hidden overflow-x-auto rounded-md border sm:block">
                  <table className="w-full text-sm table-fixed">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="w-10 p-2 text-left">#</th>
                        <th className="p-2 text-left">Item / Activity</th>
                        <th className="w-40 p-2 text-left">Activity date</th>
                        <th className="w-32 p-2 text-left">Amount (KES)</th>
                        <th className="w-10 p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className="border-t align-top">
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <Textarea
                              rows={2}
                              value={it.activity}
                              onChange={(e) => updateItem(i, "activity", e.target.value)}
                              placeholder="Describe the item or activity"
                              className="min-h-[44px]"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="date"
                              value={it.activity_date}
                              onChange={(e) => updateItem(i, "activity_date", e.target.value)}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              inputMode="decimal"
                              value={it.amount}
                              onChange={(e) => updateItem(i, "amount", e.target.value.replace(/[^0-9.]/g, ""))}
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
                        <td colSpan={3} className="p-2 text-right font-bold">TOTAL</td>
                        <td className="p-2 font-bold">{fmtKES(total)}</td>
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
                    <Label>Recipients (auto)</Label>
                    <div className="rounded-md border p-2 text-xs space-y-1">
                      <div>CDK Finance: <strong>{recipients.finance?.full_name ?? "— not configured —"}</strong></div>
                      <div>Vicar General: <strong>{recipients.vicar?.full_name ?? "— not configured —"}</strong></div>
                      <div>CDK Procurator: <strong>{recipients.procurator?.full_name ?? "— not configured —"}</strong></div>
                      <div>CDK Accounts: <strong>{recipients.accounts?.full_name ?? "— not configured —"}</strong></div>
                      <p className="text-muted-foreground pt-1">All four will see the request. CDK Finance approval is required for it to be marked Approved; CDK Accounts handles disbursement.</p>
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={submitting}>
                  <Send className="mr-1 h-4 w-4" /> {submitting ? "Submitting…" : "Submit request"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <DepartmentalReport myRequests={myRequests} />

          <Card>
            <CardHeader>
              <CardTitle>My finance requests</CardTitle>
              <CardDescription>Edit or cancel while still pending. Cancelled requests stay on record.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!loading && myRequests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
              <GroupedRequests rows={myRequests}>
                {(r) => <RequestCard key={r.id} r={r} toPDFData={toPDFData} canAct={false} onChanged={refresh} />}
              </GroupedRequests>
            </CardContent>
          </Card>
        </>
      )}

      {/* Approver / Super admin incoming view */}
      {canSeeIncoming && tab === "incoming" && (
        <ApproverPanel
          incomingRequests={incomingRequests}
          loading={loading}
          isApprover={isApprover}
          toPDFData={toPDFData}
          onChanged={refresh}
          cdkOffice={cdkOffice}
        />
      )}
    </div>
  );
}

/* ===================== Departmental Report ===================== */

function DepartmentalReport({ myRequests }: { myRequests: FRRow[] }) {
  const [period, setPeriod] = useState<Period>("week");
  const range = useMemo(() => rangeFor(period), [period]);
  const filtered = useMemo(
    () => myRequests.filter((r) => isWithinInterval(new Date(r.submitted_at), { start: range.start, end: range.end })),
    [myRequests, range],
  );
  const requested = filtered.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const approved = filtered.filter((r) => r.status === "approved").reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Departmental finance report</CardTitle>
          <CardDescription>{range.label}</CardDescription>
        </div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Requests submitted" value={String(filtered.length)} />
          <Stat label="Total requested" value={fmtKES(requested)} />
          <Stat label="Total approved" value={fmtKES(approved)} accent />
        </div>
      </CardContent>
    </Card>
  );
}

/* ===================== Approver / Super-admin panel ===================== */

function ApproverPanel({
  incomingRequests, loading, isApprover, toPDFData, onChanged, cdkOffice,
}: {
  incomingRequests: FRRow[];
  loading: boolean;
  isApprover: boolean;
  toPDFData: (r: FRRow) => FinanceRequestPDFData;
  onChanged: () => void;
  cdkOffice: CdkOffice | null;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [dept, setDept] = useState<string>("all");

  const range = useMemo(() => rangeFor(period), [period]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    incomingRequests.forEach((r) => { if (r.department_name) set.add(r.department_name); });
    return Array.from(set).sort();
  }, [incomingRequests]);

  const filtered = useMemo(() => incomingRequests.filter((r) => {
    const inPeriod = isWithinInterval(new Date(r.submitted_at), { start: range.start, end: range.end });
    const inDept = dept === "all" || r.department_name === dept;
    return inPeriod && inDept;
  }), [incomingRequests, range, dept]);

  const totalRequested = filtered.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const totalApproved = filtered.filter((r) => r.status === "approved").reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const pendingCount = filtered.filter((r) => r.status === "pending" || r.status === "adjustment_requested").length;
  const approvedCount = filtered.filter((r) => r.status === "approved").length;

  const downloadSummary = () => {
    downloadFinanceSummaryPDF({
      title: `Finance Requests Report (${period === "all" ? "All time" : period})`,
      periodLabel: range.label,
      departmentLabel: dept === "all" ? "All departments" : dept,
      rows: filtered.map((r) => ({
        submitted_at: r.submitted_at,
        department_name: r.department_name,
        requester_name: r.requester_name,
        total_amount: Number(r.total_amount) || 0,
        status: r.status,
      })),
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Finance overview</CardTitle>
            <CardDescription>{range.label}{dept !== "all" ? ` · ${dept}` : " · all departments"}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelect value={period} onChange={setPeriod} includeAll />
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={downloadSummary}>
              <Download className="mr-1 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Requests submitted" value={String(filtered.length)} />
            <Stat label="Pending requests" value={String(pendingCount)} />
            <Stat label="Approved requests" value={String(approvedCount)} accent />
            <Stat label="Amount requested (KES)" value={fmtKES(totalRequested)} />
            <Stat label="Amount approved (KES)" value={fmtKES(totalApproved)} accent />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isApprover ? "Requests awaiting your decision" : "Requests sent to you"}</CardTitle>
          <CardDescription>Grouped by day, week, month and year for easy review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && filtered.length === 0 && <p className="text-sm text-muted-foreground">Nothing in this range.</p>}
          <GroupedRequests rows={filtered}>
            {(r) => <RequestCard key={r.id} r={r} toPDFData={toPDFData} canAct={isApprover} onChanged={onChanged} cdkOffice={cdkOffice} />}
          </GroupedRequests>
        </CardContent>
      </Card>
    </>
  );
}

/* ===================== Grouped list (clamped) ===================== */

function GroupedRequests({ rows, children }: { rows: FRRow[]; children: (r: FRRow) => React.ReactNode }) {
  // Group by year → month → week → day. Render collapsibles.
  const tree = useMemo(() => {
    const root: Record<string, Record<string, Record<string, Record<string, FRRow[]>>>> = {};
    rows.forEach((r) => {
      const d = new Date(r.submitted_at);
      const y = format(d, "yyyy");
      const m = format(d, "MMMM yyyy");
      const w = `Week of ${format(startOfWeek(d, { weekStartsOn: 1 }), "MMM d")}`;
      const day = format(d, "EEE, MMM d");
      (((((root[y] ??= {})[m] ??= {})[w] ??= {})[day] ??= [])).push(r);
    });
    return root;
  }, [rows]);

  const years = Object.keys(tree).sort((a, b) => Number(b) - Number(a));
  if (years.length === 0) return null;
  return (
    <div className="space-y-2">
      {years.map((y) => (
        <Collapsible key={y} label={y} defaultOpen>
          {Object.keys(tree[y]).map((m) => (
            <Collapsible key={m} label={m} defaultOpen>
              {Object.keys(tree[y][m]).map((w) => (
                <Collapsible key={w} label={w} defaultOpen>
                  {Object.keys(tree[y][m][w]).map((day) => (
                    <Collapsible key={day} label={day} defaultOpen>
                      <div className="space-y-3">{tree[y][m][w][day].map(children)}</div>
                    </Collapsible>
                  ))}
                </Collapsible>
              ))}
            </Collapsible>
          ))}
        </Collapsible>
      ))}
    </div>
  );
}

function Collapsible({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/40">
        <span>{label}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="space-y-2 border-t p-2">{children}</div>}
    </div>
  );
}

/* ===================== Bits ===================== */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${accent ? "bg-emerald-50 border-emerald-200" : "bg-muted/30"}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function PeriodSelect({ value, onChange, includeAll = false }: { value: Period; onChange: (p: Period) => void; includeAll?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Period)}>
      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="day">Daily</SelectItem>
        <SelectItem value="week">Weekly</SelectItem>
        <SelectItem value="month">Monthly</SelectItem>
        <SelectItem value="year">Yearly</SelectItem>
        {includeAll && <SelectItem value="all">All time</SelectItem>}
      </SelectContent>
    </Select>
  );
}

function statusBadge(s: FRStatus) {
  const map: Record<FRStatus, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-amber-100 text-amber-900 border-amber-300" },
    approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
    rejected: { label: "Rejected", cls: "bg-red-100 text-red-900 border-red-300" },
    adjustment_requested: { label: "Adjustment requested", cls: "bg-blue-100 text-blue-900 border-blue-300" },
    cancelled: { label: "Cancelled", cls: "bg-zinc-200 text-zinc-700 border-zinc-300" },
  };
  const m = map[s] ?? map.pending;
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

function ApprovalTracker({ r }: { r: FRRow }) {
  if (r.status === "cancelled" || r.status === "rejected") return null;
  const stages: { key: string; label: string; decision: string | null; name: string | null; at: string | null; isAuthorize: boolean }[] = [
    { key: "fin", label: "Finance Administrator", decision: r.finance_admin_decision, name: r.finance_admin_name, at: r.finance_admin_at, isAuthorize: false },
    { key: "vg", label: "Vicar General", decision: r.vicar_general_decision, name: r.vicar_general_name, at: r.vicar_general_at, isAuthorize: true },
    { key: "proc", label: "Procurator", decision: r.procurator_decision, name: r.procurator_name, at: r.procurator_at, isAuthorize: true },
  ];
  const allApproved = stages.every((s) => s.decision === "approved");
  return (
    <div className="mt-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Approval tracker</p>
      <div className="flex flex-col gap-0.5">
        {stages.map((s) => {
          const approved = s.decision === "approved";
          const rejected = s.decision === "rejected";
          const adjusted = s.decision === "adjustment_requested";
          const approvedWord = s.isAuthorize ? "AUTHORIZED" : "APPROVED";
          const status = approved ? approvedWord : rejected ? "REJECTED" : adjusted ? "ADJUSTMENT REQUESTED" : "PENDING";
          const cls = approved
            ? "text-emerald-700"
            : rejected
              ? "text-red-700"
              : adjusted
                ? "text-blue-700"
                : "text-amber-700";
          return (
            <div key={s.key} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium min-w-[140px]">{s.label}:</span>
              <span className={`font-semibold ${cls}`}>{status}</span>
              {approved && s.name && (
                <span className="text-[10px] text-muted-foreground">— by {s.name}{s.at ? `, ${format(new Date(s.at), "MMM d, yyyy h:mm a")}` : ""}</span>
              )}
            </div>
          );
        })}
      </div>
      {allApproved && (
        <p className="mt-2 text-xs font-semibold text-emerald-800">
          ✓ YOUR REQUEST HAS BEEN APPROVED &amp; AUTHORIZED — NOW AWAITING ACCOUNTS OFFICE VERDICT
        </p>
      )}
      <DisbursementNotice r={r} />
    </div>
  );
}

function DisbursementNotice({ r }: { r: FRRow }) {
  if (!r.accounts_disbursement_status) return null;
  const isAvailable = r.accounts_disbursement_status === "funds_available";
  const message = isAvailable
    ? "FUNDS AVAILABLE — DISBURSEMENT UNDERWAY"
    : "FUNDS NOT AVAILABLE FOR NOW — SEE FINANCE ADMINISTRATOR FOR GUIDANCE";
  return (
    <div className={`mt-2 border-l-2 pl-2 ${isAvailable ? "border-emerald-500" : "border-red-500"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Disbursement process</p>
      <p className={`text-xs font-bold ${isAvailable ? "text-emerald-800" : "text-red-800"}`}>{message}</p>
      {r.accounts_disbursement_name && (
        <p className="text-[10px] text-muted-foreground">
          by {r.accounts_disbursement_name}
          {r.accounts_disbursement_at ? `, ${format(new Date(r.accounts_disbursement_at), "MMM d, yyyy h:mm a")}` : ""}
        </p>
      )}
    </div>
  );
}

/* ===================== Request card ===================== */

function RequestCard({
  r, toPDFData, canAct, onChanged, cdkOffice,
}: {
  r: FRRow;
  toPDFData: (r: FRRow) => FinanceRequestPDFData;
  canAct: boolean;
  onChanged: () => void;
  cdkOffice?: CdkOffice | null;
}) {
  const { user, profile, roles, isSuperAdmin, isAdministrator, isProtectedSuperAdmin } = useAuth();
  const isAccountsViewer = isAdministrator && !isSuperAdmin;
  const [open, setOpen] = useState(false);
  type ApproverRole = "finance_admin" | "vicar_general" | "procurator";
  const [dialog, setDialog] = useState<null | { decision: "approve" | "reject" | "adjust"; role: ApproverRole }>(null);
  const [signName, setSignName] = useState("");
  const [accountUsed, setAccountUsed] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit & cancel
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<ItemRow[]>(() => (r.items ?? []).map((i: ItemRow) => ({ activity: i.activity, amount: String(i.amount), activity_date: i.activity_date ?? "" })));
  const [editMpesa, setEditMpesa] = useState<string>(r.mpesa_phone ?? "");
  const [savingEdit, setSavingEdit] = useState(false);
  const editTotal = useMemo(() => editItems.reduce((s, i) => s + (Number(i.amount) || 0), 0), [editItems]);

  const ownApproverRole: ApproverRole | null =
    roles.includes("finance_admin") ? "finance_admin"
      : roles.includes("vicar_general") ? "vicar_general"
        : roles.includes("procurator") ? "procurator" : null;
  // A super admin can ONLY act for the role corresponding to their own CDK
  // office account (CDK Finance → finance_admin, Vicar General → vicar_general,
  // CDK Procurator → procurator). Other super admins cannot approve here.
  const superAdminRole: ApproverRole | null =
    cdkOffice === "finance" ? "finance_admin"
      : cdkOffice === "vicar" ? "vicar_general"
        : cdkOffice === "procurator" ? "procurator" : null;
  const actableRoles: ApproverRole[] = isSuperAdmin
    ? (superAdminRole ? [superAdminRole] : [])
    : (ownApproverRole ? [ownApproverRole] : []);

  const roleLabel = (role: ApproverRole) =>
    role === "finance_admin" ? "Finance Administrator"
      : role === "vicar_general" ? "Vicar General" : "Procurator";

  // The only account allowed in the "Account used" select is the signed-in
  // user's own account — this prevents a super admin from approving on
  // behalf of another office.
  const myAccountLabel = `Myself — ${profile?.full_name ?? "current account"}`;

  const submitDecision = async () => {
    if (!user || !dialog) return;
    if (!signName.trim()) return toast.error("Please type your name to sign");
    if (!accountUsed) return toast.error("Please select the account you are using");
    if (accountUsed !== user.id) return toast.error("You can only approve using your own account");
    setSaving(true);
    const nowIso = new Date().toISOString();
    const prefix = dialog.role;
    const decisionValue = dialog.decision === "approve" ? "approved" : dialog.decision === "reject" ? "rejected" : "adjustment_requested";
    // Stamp the account label so the decision area / PDF clearly shows
    // which account performed the action (e.g. "CDK FINANCE").
    const accountLabel = profile?.full_name ?? "current account";
    const stampedNote = `[Account: ${accountLabel}]${note.trim() ? ` ${note.trim()}` : ""}`;
    const update: Record<string, unknown> = {
      [`${prefix}_id`]: user.id,
      [`${prefix}_name`]: signName.trim(),
      [`${prefix}_decision`]: decisionValue,
      [`${prefix}_note`]: stampedNote,
      [`${prefix}_at`]: nowIso,
    };
    if (dialog.decision === "reject") update.status = "rejected";
    else if (dialog.decision === "adjust") update.status = "adjustment_requested";
    else {
      // Finance Administrator approval alone marks the request as approved.
      // Vicar General and Procurator can remain pending and sign later.
      if (prefix === "finance_admin") {
        update.status = "approved";
      }
    }
    const { error } = await supabase.from("finance_requests").update(update as never).eq("id", r.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Decision recorded");
    setDialog(null); setSignName(""); setAccountUsed(""); setNote(""); onChanged();
  };

  const cancelRequest = async () => {
    if (!confirm("Cancel this request? It will remain on record as cancelled.")) return;
    const { error } = await supabase.from("finance_requests").update({ status: "cancelled" } as never).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Request cancelled"); onChanged();
  };

  // Temporary: super admins can delete finance requests while the system is
  // being tested. Remove this once testing is complete to preserve records.
  const deleteRequest = async () => {
    if (!confirm(`Permanently delete this finance request (${r.serial_number ?? r.id})? This cannot be undone.`)) return;
    const { error } = await supabase.from("finance_requests").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Request deleted"); onChanged();
  };

  // CDK Accounts disbursement decision
  const [disbursing, setDisbursing] = useState(false);
  const setDisbursement = async (status: "funds_available" | "funds_not_available") => {
    if (!user || !profile) return;
    const label = status === "funds_available" ? "FUNDS AVAILABLE" : "FUNDS NOT AVAILABLE";
    if (!confirm(`Mark this request as ${label}?`)) return;
    setDisbursing(true);
    const { error } = await supabase.from("finance_requests").update({
      accounts_disbursement_status: status,
      accounts_disbursement_by: user.id,
      accounts_disbursement_name: profile.full_name,
      accounts_disbursement_at: new Date().toISOString(),
    } as never).eq("id", r.id);
    setDisbursing(false);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${label}`); onChanged();
  };




  const saveEdit = async () => {
    const cleaned = editItems.filter((i) => i.activity.trim() !== "" && Number(i.amount) > 0);
    if (cleaned.length === 0) return toast.error("Add at least one item with an amount");
    setSavingEdit(true);
    const { error } = await supabase.from("finance_requests").update({
      items: cleaned.map((i) => ({ activity: i.activity.trim(), amount: Number(i.amount) || 0, activity_date: i.activity_date || null })),
      total_amount: cleaned.reduce((s, i) => s + (Number(i.amount) || 0), 0),
      mpesa_phone: editMpesa.trim() || null,
    } as never).eq("id", r.id);
    setSavingEdit(false);
    if (error) return toast.error(error.message);
    toast.success("Request updated");
    setEditing(false);
    onChanged();
  };

  const isMine = r.requester_id === user?.id;
  // Once a request is approved, rejected, or cancelled it is locked: the
  // requester can no longer edit, cancel, or delete it. Edit/cancel only work
  // while the request is still pending (or in adjustment_requested).
  const canEditOrCancel = isMine && (r.status === "pending" || r.status === "adjustment_requested");
  const financeApproved = r.finance_admin_decision === "approved";
  const vicarApproved = r.vicar_general_decision === "approved";
  const procuratorApproved = r.procurator_decision === "approved";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {r.serial_number && (
              <span className="mr-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">{r.serial_number}</span>
            )}
            {r.department_name ?? "—"} — {fmtKES(Number(r.total_amount))}
          </p>
          <p className="text-xs text-muted-foreground">By {r.requester_name} · {format(new Date(r.submitted_at), "PPp")}</p>
          <p className="text-xs text-muted-foreground">Sent to: {[r.selected_super_admin_name, r.vicar_super_admin_name, r.procurator_super_admin_name].filter(Boolean).join(", ") || "—"}</p>
          <ApprovalTracker r={r} />

        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(r.status)}
          {(() => {
            // CDK Accounts (administrator viewer) can only download once a request is
            // fully authorized: finance admin approved AND at least one of Vicar
            // General / Procurator has authorized.
            const fullyAuthorizedForAccounts =
              financeApproved && (vicarApproved || procuratorApproved);
            if (isAccountsViewer && !fullyAuthorizedForAccounts) {
              return (
                <span className="rounded border border-dashed border-muted-foreground/40 px-2 py-1 text-[11px] text-muted-foreground">
                  Download unlocks after finance approval + authorization
                </span>
              );
            }
            return (
              <>
                {isAccountsViewer && (
                  <>
                    <Button
                      size="sm"
                      variant={r.accounts_disbursement_status === "funds_available" ? "default" : "outline"}
                      className={r.accounts_disbursement_status === "funds_available" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                      onClick={() => setDisbursement("funds_available")}
                      disabled={disbursing}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Funds Available
                    </Button>
                    <Button
                      size="sm"
                      variant={r.accounts_disbursement_status === "funds_not_available" ? "default" : "outline"}
                      className={r.accounts_disbursement_status === "funds_not_available" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                      onClick={() => setDisbursement("funds_not_available")}
                      disabled={disbursing}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Funds Not Available
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => downloadFinanceRequestPDF(toPDFData(r))}>
                  <Download className="mr-1 h-3.5 w-3.5" /> PDF
                </Button>
              </>
            );
          })()}
          {canEditOrCancel && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={cancelRequest}>
                <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
            </>
          )}
          {isProtectedSuperAdmin && (
            <Button size="sm" variant="destructive" onClick={deleteRequest}>
              <Ban className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Details"}</Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          {/* Mobile: stacked cards so long activity text wraps and is fully readable */}
          <div className="space-y-1 sm:hidden">
            {(r.items ?? []).map((it, i) => (
              <div key={i} className="text-sm py-1.5 border-b border-dashed last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">#{i + 1}</div>
                  <div className="text-right font-bold">{fmtKES(Number(it.amount))}</div>
                </div>
                <div className="break-words whitespace-pre-wrap">{it.activity}</div>
                <div className="text-xs text-muted-foreground">
                  Date: <strong className="text-foreground">{it.activity_date ? format(new Date(it.activity_date), "PP") : "—"}</strong>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="font-bold">TOTAL</span>
              <span className="font-bold">{fmtKES(Number(r.total_amount))}</span>
            </div>
          </div>

          {/* Desktop/tablet: original table, now horizontally scrollable as a safety net */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr><th className="p-2 text-left w-10">#</th><th className="p-2 text-left">Item / Activity</th><th className="p-2 text-left w-32">Date</th><th className="p-2 text-right w-32">Amount</th></tr>
              </thead>
              <tbody>
                {(r.items ?? []).map((it, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2 break-words">{it.activity}</td>
                    <td className="p-2">{it.activity_date ? format(new Date(it.activity_date), "PP") : "—"}</td>
                    <td className="p-2 text-right">{fmtKES(Number(it.amount))}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/40">
                  <td colSpan={3} className="p-2 text-right font-bold">TOTAL</td>
                  <td className="p-2 text-right font-bold">{fmtKES(Number(r.total_amount))}</td>
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
            <ApprovalBlock title="Finance Administrator" name={r.finance_admin_name} decision={r.finance_admin_decision} at={r.finance_admin_at} note={r.finance_admin_note} accountLabel="CDK Finance" />
            <ApprovalBlock title="Vicar General" name={r.vicar_general_name} decision={r.vicar_general_decision} at={r.vicar_general_at} note={r.vicar_general_note} accountLabel="Vicar General" approvedWord="AUTHORIZED" />
            <ApprovalBlock title="Procurator" name={r.procurator_name} decision={r.procurator_decision} at={r.procurator_at} note={r.procurator_note} accountLabel="CDK Procurator" approvedWord="AUTHORIZED" />
          </div>

          {canAct && !isMine && actableRoles.length > 0 && r.status !== "cancelled" && r.status !== "rejected" && (
            <div className="space-y-2 border-t pt-3">
              {actableRoles.map((role) => {
                const currentDecision =
                  role === "finance_admin" ? r.finance_admin_decision
                    : role === "vicar_general" ? r.vicar_general_decision
                      : r.procurator_decision;
                const openDialog = (decision: "approve" | "reject" | "adjust") => {
                  setDialog({ decision, role });
                  setSignName(profile?.full_name ?? "");
                  setAccountUsed(user?.id ?? "");
                  setNote("");
                };
                return (
                  <div key={role} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium w-44">{roleLabel(role)}{currentDecision ? ` · ${currentDecision}` : ""}:</span>
                    <Button size="sm" onClick={() => openDialog("approve")}>
                      <CheckCircle2 className="mr-1 h-4 w-4" /> {role === "finance_admin" ? "Approve" : "Authorize"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => openDialog("reject")}>
                      <XCircle className="mr-1 h-4 w-4" /> Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openDialog("adjust")}>
                      <RefreshCw className="mr-1 h-4 w-4" /> Adjust budget
                    </Button>
                  </div>
                );
              })}
              {isSuperAdmin && (
                <p className="text-[11px] text-muted-foreground">You can only sign for the role tied to this account ({profile?.full_name ?? "your account"}). Date is filled automatically.</p>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.decision === "approve"
                ? (dialog.role === "finance_admin" ? "Approve" : "Authorize")
                : dialog?.decision === "reject" ? "Reject" : "Request budget adjustment"}
              {dialog ? ` — ${roleLabel(dialog.role)}` : ""}
            </DialogTitle>
            <DialogDescription>
              Sign by typing your full name (date is recorded automatically). {dialog?.decision !== "approve" && "Please add a note explaining your decision."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Your name (signature) *</Label><Input value={signName} onChange={(e) => setSignName(e.target.value)} /></div>
            <div>
              <Label>Account you are using *</Label>
              <Select value={accountUsed} onValueChange={setAccountUsed}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {user && <SelectItem value={user.id}>{myAccountLabel}</SelectItem>}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">For audit purposes, you can only approve using your own account.</p>
            </div>
            <div><Label>Note {dialog?.decision !== "approve" && "*"}</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / details" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={submitDecision} disabled={saving || !signName.trim() || !accountUsed || (dialog?.decision !== "approve" && !note.trim())}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit finance request</DialogTitle>
            <DialogDescription>Update items and recipient. Approvers will see the latest version.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="w-10 p-2 text-left">#</th>
                    <th className="p-2 text-left">Item / Activity</th>
                    <th className="w-40 p-2 text-left">Activity date</th>
                    <th className="w-32 p-2 text-left">Amount</th>
                    <th className="w-10 p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((it, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">
                        <Textarea rows={2} value={it.activity} onChange={(e) => setEditItems((p) => p.map((x, idx) => idx === i ? { ...x, activity: e.target.value } : x))} className="min-h-[44px]" />
                      </td>
                      <td className="p-2">
                        <Input type="date" value={it.activity_date} onChange={(e) => setEditItems((p) => p.map((x, idx) => idx === i ? { ...x, activity_date: e.target.value } : x))} />
                      </td>
                      <td className="p-2">
                        <Input inputMode="decimal" value={it.amount} onChange={(e) => setEditItems((p) => p.map((x, idx) => idx === i ? { ...x, amount: e.target.value.replace(/[^0-9.]/g, "") } : x))} />
                      </td>
                      <td className="p-2">
                        {editItems.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => setEditItems((p) => p.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/40">
                    <td colSpan={3} className="p-2 text-right font-bold">TOTAL</td>
                    <td className="p-2 font-bold">{fmtKES(editTotal)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditItems((p) => [...p, emptyItem()])}>
              <Plus className="mr-1 h-4 w-4" /> Add item
            </Button>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>M-Pesa phone</Label>
                <Input value={editMpesa} onChange={(e) => setEditMpesa(e.target.value)} />
              </div>
              <div>
                <Label>Recipients (auto)</Label>
                <div className="rounded-md border p-2 text-xs space-y-1">
                  <div>CDK Finance: <strong>{r.selected_super_admin_name ?? "—"}</strong></div>
                  <div>Vicar General: <strong>{r.vicar_super_admin_name ?? "—"}</strong></div>
                  <div>CDK Procurator: <strong>{r.procurator_super_admin_name ?? "—"}</strong></div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApprovalBlock({ title, name, decision, at, note, accountLabel, approvedWord }: { title: string; name: string | null; decision: string | null; at: string | null; note: string | null; accountLabel?: string; approvedWord?: string }) {
  const displayWord = decision === "approved" && approvedWord ? approvedWord : decision ? decision.replace("_", " ").toUpperCase() : null;
  const decisionDisplay = displayWord
    ? `${displayWord}${accountLabel ? ` [${accountLabel}${name ? `: ${name}` : ""}]` : ""}`
    : "— pending —";
  return (
    <div className="text-xs">
      <p className="font-semibold text-primary">{title}</p>
      <p>Name: <span className="font-medium">{name ?? "— pending —"}</span></p>
      <p>Decision: <span className="font-medium">{decisionDisplay}</span></p>
      <p>Date: <span className="font-medium">{at ? format(new Date(at), "PPp") : "—"}</span></p>
      {note && <p className="text-muted-foreground">Note: {note}</p>}
    </div>
  );
}
