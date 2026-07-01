import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

export interface FinanceItem {
  activity: string;
  amount: number | string;
  activity_date?: string | null;
  payment_method?: string | null;
}

export interface FinanceRequestPDFData {
  id: string;
  serial_number?: string | null;
  requester_name: string;
  requester_signature: string;
  mpesa_phone: string | null;
  department_name: string | null;
  items: FinanceItem[];
  total_amount: number;
  submitted_at: string;
  selected_super_admin_name: string | null;
  status: string;

  finance_admin_name?: string | null;
  finance_admin_decision?: string | null;
  finance_admin_note?: string | null;
  finance_admin_at?: string | null;

  vicar_general_name?: string | null;
  vicar_general_decision?: string | null;
  vicar_general_note?: string | null;
  vicar_general_at?: string | null;

  procurator_name?: string | null;
  procurator_decision?: string | null;
  procurator_note?: string | null;
  procurator_at?: string | null;
}

const DIOCESE = "Catholic Diocese of Kitale";

const fmtKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 }).format(n || 0);

export function buildFinanceRequestPDF(data: FinanceRequestPDFData): jsPDF {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text(DIOCESE, 14, 14);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text("Secretariat — Finance Request", 14, 22);

  doc.setTextColor(30, 30, 30);
  let y = 40;

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "—", pageW - 80);
    doc.text(lines, 70, y);
    y += Math.max(6, lines.length * 5 + 1);
  };

  if (data.serial_number) row("Serial No.:", data.serial_number);
  row("Requested by:", data.requester_name);
  row("Department:", data.department_name ?? "—");
  row("Date submitted:", format(parseISO(data.submitted_at), "PPpp"));
  row("Sent to (Super Admin):", data.selected_super_admin_name ?? "—");
  row("Status:", data.status.replace("_", " ").toUpperCase());

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Items / Activities", 14, y);
  y += 2;
  doc.setDrawColor(180);
  doc.line(14, y, pageW - 14, y);
  y += 2;

  const body = data.items
    .filter((i) => (i.activity ?? "").toString().trim() !== "" || Number(i.amount) > 0)
    .map((it, idx) => [
      String(idx + 1),
      it.activity || "—",
      it.activity_date ? format(parseISO(it.activity_date), "PP") : "—",
      (it.payment_method === "cheque" ? "Cheque" : "Cash"),
      fmtKES(Number(it.amount) || 0),
    ]);

  autoTable(doc, {
    startY: y + 2,
    head: [["#", "Item / Activity", "Activity date", "Payment", "Amount (KES)"]],
    body,
    foot: [["", "", "", "TOTAL", fmtKES(Number(data.total_amount) || 0)]],
    theme: "grid",
    headStyles: { fillColor: [102, 0, 0], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 230, 230], textColor: 0, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 2: { cellWidth: 28 }, 3: { cellWidth: 22, halign: "center" }, 4: { cellWidth: 36, halign: "right" } },
    styles: { fontSize: 10, cellPadding: 3 },
  });

  // @ts-expect-error lastAutoTable injected by autotable
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Requester Sign-off", 14, y);
  y += 2;
  doc.line(14, y, pageW - 14, y);
  y += 6;
  row("Signed (name):", data.requester_signature);
  row("Date & time:", format(parseISO(data.submitted_at), "PPpp"));
  row("M-Pesa phone:", data.mpesa_phone ?? "—");

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Approvals", 14, y);
  y += 2;
  doc.line(14, y, pageW - 14, y);
  y += 4;

  const drawApproval = (title: string, name?: string | null, decision?: string | null, when?: string | null, note?: string | null, approvedWord: string = "APPROVED") => {
    if (y > 240) { doc.addPage(); y = 20; }
    const blockStartY = y;
    const sigBoxX = pageW - 84;
    const sigBoxW = 70;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Name (e-signature): ${name ?? "— pending —"}`, 14, y);
    y += 5;
    let decisionLine: string;
    if (decision === "approved") {
      decisionLine = approvedWord === "AUTHORIZED"
        ? `Authorized by: ${name ?? "—"}`
        : `Decision: APPROVED — ${name ?? "—"}`;
    } else {
      const txt = decision ? decision.replace("_", " ").toUpperCase() : "— pending —";
      decisionLine = approvedWord === "AUTHORIZED" ? `Authorized by: ${txt}` : `Decision: ${txt}`;
    }
    doc.text(decisionLine, 14, y);
    y += 5;
    doc.text(`Date: ${when ? format(parseISO(when), "PPpp") : "—"}`, 14, y);
    y += 5;
    if (note) {
      const lines = doc.splitTextToSize(`Note: ${note}`, sigBoxX - 18);
      doc.text(lines, 14, y);
      y += lines.length * 5;
    }

    const blockEndY = Math.max(y, blockStartY + 24);
    doc.setDrawColor(150);
    doc.rect(sigBoxX, blockStartY, sigBoxW, blockEndY - blockStartY);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Hand signature", sigBoxX + 2, blockStartY + 4);
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);

    y = blockEndY + 6;
  };

  drawApproval("Finance Administrator", data.finance_admin_name, data.finance_admin_decision, data.finance_admin_at, data.finance_admin_note);
  drawApproval("Procurator", data.procurator_name, data.procurator_decision, data.procurator_at, data.procurator_note);

  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Authorization", 14, y);
  y += 2;
  doc.line(14, y, pageW - 14, y);
  y += 4;

  drawApproval("Vicar General", data.vicar_general_name, data.vicar_general_decision, data.vicar_general_at, data.vicar_general_note, "AUTHORIZED");

  return doc;
}

export function downloadFinanceRequestPDF(data: FinanceRequestPDFData) {
  const doc = buildFinanceRequestPDF(data);
  const stamp = format(parseISO(data.submitted_at), "yyyyMMdd-HHmm");
  const dept = (data.department_name ?? "request").replace(/[^a-z0-9]+/gi, "_");
  doc.save(`finance-request_${dept}_${stamp}.pdf`);
}
