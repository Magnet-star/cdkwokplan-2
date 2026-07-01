import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, addDays } from "date-fns";

export interface WorkPlanItemPDF {
  activity_date: string;
  activity: string;
  location: string | null;
  needs_vehicle: boolean;
  needs_money: boolean;
  money_amount: number | string | null;
  notes: string | null;
}

export interface WorkPlanPDFData {
  weekStartDate: string;
  status: string;
  signature: string | null;
  submittedAt: string | null;
  hodName: string;
  departmentName: string;
  hodPosition?: string | null;
  items: WorkPlanItemPDF[];
}

const DIOCESAN_SECRETARY = "REV. FR. JAMES ORANGA";
const DIOCESE = "Catholic Diocese of Kitale";

export function downloadWorkPlanPDF(plan: WorkPlanPDFData) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header banner
  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text(DIOCESE, 14, 14);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text("Secretariat — Weekly Work Plan", 14, 22);

  doc.setTextColor(0, 0, 0);
  let y = 40;

  const weekStart = parseISO(plan.weekStartDate);
  const weekEnd = addDays(weekStart, 6);

  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Plan Details", 14, y); y += 2;
  doc.setDrawColor(180); doc.line(14, y, pageW - 14, y); y += 7;

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "—", pageW - 70);
    doc.text(lines, 60, y);
    y += Math.max(6, lines.length * 5 + 1);
  };

  row("Department:", plan.departmentName);
  row("Head of Department:", plan.hodName + (plan.hodPosition ? ` (${plan.hodPosition})` : ""));
  row("Reporting Week:", `${format(weekStart, "EEE, MMM d, yyyy")} — ${format(weekEnd, "EEE, MMM d, yyyy")}`);
  row("Status:", plan.status.toUpperCase());
  if (plan.submittedAt) row("Submitted:", format(parseISO(plan.submittedAt), "PPp"));
  row("Date Generated:", format(new Date(), "PPp"));

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Weekly Work Plan", 14, y); y += 2;
  doc.line(14, y, pageW - 14, y); y += 4;

  // Build 7-day rows. Group items by date.
  const itemsByDate = new Map<string, WorkPlanItemPDF[]>();
  for (const it of plan.items) {
    const k = it.activity_date;
    if (!itemsByDate.has(k)) itemsByDate.set(k, []);
    itemsByDate.get(k)!.push(it);
  }

  const tableRows: any[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const key = format(d, "yyyy-MM-dd");
    const dayLabel = `${format(d, "EEEE")}\n${format(d, "MMM d, yyyy")}`;
    const dayItems = itemsByDate.get(key) ?? [];
    if (dayItems.length === 0) {
      tableRows.push([dayLabel, "—", "—", "—", "—", "—"]);
    } else {
      const sep = dayItems.length > 1 ? "\n\n" : "\n";
      const activities = dayItems.map((it, idx) => `${dayItems.length > 1 ? `${idx + 1}. ` : ""}${it.activity}`).join(sep);
      const locations = dayItems.map((it) => it.location || "—").join(sep);
      const vehicle = dayItems.map((it) => (it.needs_vehicle ? "Yes" : "No")).join(sep);
      const funds = dayItems.map((it) => {
        if (!it.needs_money) return "No";
        const amt = it.money_amount != null && it.money_amount !== "" ? ` (KES ${Number(it.money_amount).toLocaleString()})` : "";
        return `Yes${amt}`;
      }).join(sep);
      const notes = dayItems.map((it) => it.notes || "—").join(sep);
      tableRows.push([dayLabel, activities, locations, vehicle, funds, notes]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Day & Date", "Activity / Activities", "Location", "Vehicle Required", "Funds Required", "Notes"]],
    body: tableRows,
    styles: { fontSize: 9, cellPadding: 3, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: [102, 0, 0], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: "bold" },
      1: { cellWidth: 55 },
      2: { cellWidth: 28 },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 25, halign: "center" },
      5: { cellWidth: "auto" },
    },
    margin: { left: 14, right: 14 },
  });

  let afterY = (doc as any).lastAutoTable.finalY + 12;

  // Signature section — ensure page space
  const neededH = 60;
  if (afterY + neededH > pageH - 14) {
    doc.addPage();
    afterY = 20;
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Approval & Signatures", 14, afterY);
  doc.setDrawColor(180); doc.line(14, afterY + 2, pageW - 14, afterY + 2);
  afterY += 10;

  const colW = (pageW - 28 - 10) / 2;
  const leftX = 14;
  const rightX = 14 + colW + 10;

  const sigBlock = (x: number, title: string, nameLabel: string, nameValue: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(title, x, afterY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    let ly = afterY + 8;
    doc.text(`${nameLabel}: ${nameValue || "______________________"}`, x, ly); ly += 10;
    doc.text("Signature: ______________________", x, ly); ly += 10;
    doc.text("Date: ______________________", x, ly);
  };

  sigBlock(leftX, "Prepared By", "HOD Name", plan.hodName);
  sigBlock(rightX, "Approved By", "Diocesan Secretary", DIOCESAN_SECRETARY);

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(60);
    doc.text(`${DIOCESE} — Weekly Work Plan`, 14, pageH - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 8, { align: "right" });
  }

  const fname = `work-plan-${plan.departmentName.replace(/\s+/g, "_")}-${plan.weekStartDate}.pdf`;
  doc.save(fname);
}
