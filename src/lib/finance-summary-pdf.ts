import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface FinanceSummaryRow {
  submitted_at: string;
  department_name: string | null;
  requester_name: string;
  total_amount: number;
  status: string;
}

const fmtKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 }).format(n || 0);

export function downloadFinanceSummaryPDF(opts: {
  title: string;
  periodLabel: string;
  departmentLabel: string;
  rows: FinanceSummaryRow[];
}) {
  const { title, periodLabel, departmentLabel, rows } = opts;
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255);
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text("Catholic Diocese of Kitale", 14, 13);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text(title, 14, 21);

  doc.setTextColor(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Period: ${periodLabel}`, 14, 36);
  doc.text(`Departments: ${departmentLabel}`, 14, 42);
  doc.text(`Generated: ${format(new Date(), "PPpp")}`, 14, 48);

  const totalRequested = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const totalApproved = rows
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const totalRejected = rows
    .filter((r) => r.status === "rejected")
    .reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const totalPending = rows
    .filter((r) => r.status === "pending" || r.status === "adjustment_requested")
    .reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

  autoTable(doc, {
    startY: 54,
    head: [["Date", "Department", "Requester", "Status", "Amount"]],
    body: rows.map((r) => [
      format(new Date(r.submitted_at), "PP"),
      r.department_name ?? "—",
      r.requester_name,
      r.status.replace("_", " ").toUpperCase(),
      fmtKES(Number(r.total_amount) || 0),
    ]),
    foot: [
      ["", "", "", "TOTAL REQUESTED", fmtKES(totalRequested)],
      ["", "", "", "TOTAL APPROVED", fmtKES(totalApproved)],
      ["", "", "", "Total pending", fmtKES(totalPending)],
      ["", "", "", "Total rejected", fmtKES(totalRejected)],
    ],
    theme: "grid",
    headStyles: { fillColor: [102, 0, 0], textColor: 255 },
    footStyles: { fillColor: [240, 230, 230], textColor: 0, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 , fontStyle: "bold", textColor: [0,0,0] },
    columnStyles: { 4: { halign: "right" } },
  });

  doc.save(`finance-summary_${periodLabel.replace(/[^a-z0-9]+/gi, "_")}.pdf`);
}
