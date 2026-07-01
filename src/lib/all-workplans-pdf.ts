import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, addDays } from "date-fns";
import type { WorkPlanItemPDF } from "./work-plan-pdf";

export interface DeptWorkPlanPDF {
  departmentName: string;
  hodName: string;
  hodPosition?: string | null;
  status: string;
  signature: string | null;
  submittedAt: string | null;
  items: WorkPlanItemPDF[];
}

const DIOCESAN_SECRETARY = "REV. FR. JAMES ORANGA";
const DIOCESE = "Catholic Diocese of Kitale";

export function buildAllDepartmentsWorkPlansPDF(
  plans: DeptWorkPlanPDF[],
  weekStartDate: string,
): { blob: Blob; filename: string } {
  const doc = new jsPDF();

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const weekStart = parseISO(weekStartDate);
  const weekEnd = addDays(weekStart, 6);

  // Cover page
  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold"); doc.setFontSize(20);
  doc.text(DIOCESE, 14, 18);
  doc.setFont("times", "normal"); doc.setFontSize(12);
  doc.text("Secretariat — Consolidated Weekly Work Plans", 14, 28);

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text("Week of:", 14, 60);
  doc.setFont("helvetica", "normal");
  doc.text(`${format(weekStart, "EEEE, MMM d, yyyy")} — ${format(weekEnd, "EEEE, MMM d, yyyy")}`, 50, 60);

  doc.setFont("helvetica", "bold");
  doc.text("Departments:", 14, 72);
  doc.setFont("helvetica", "normal");
  doc.text(String(plans.length), 50, 72);

  doc.setFont("helvetica", "bold");
  doc.text("Generated:", 14, 84);
  doc.setFont("helvetica", "normal");
  doc.text(format(new Date(), "PPp"), 50, 84);

  // Table of contents
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Table of Contents", 14, 104);
  doc.setDrawColor(180); doc.line(14, 106, pageW - 14, 106);
  let tocY = 114;
  plans.forEach((p, idx) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`${idx + 1}. ${p.departmentName}  —  HOD: ${p.hodName}`, 14, tocY);
    tocY += 6;
    if (tocY > pageH - 20) { doc.addPage(); tocY = 20; }
  });

  // Per-department sections
  plans.forEach((plan) => {
    doc.addPage();
    renderDepartmentSection(doc, plan, weekStart, weekEnd, pageW, pageH);
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(60);
    doc.text(`${DIOCESE} — Consolidated Weekly Work Plans`, 14, pageH - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 8, { align: "right" });
  }

  const filename = `all-work-plans-${weekStartDate}.pdf`;
  const blob = doc.output("blob");
  return { blob, filename };
}

export function downloadAllDepartmentsWorkPlansPDF(
  plans: DeptWorkPlanPDF[],
  weekStartDate: string,
): { blob: Blob; filename: string } {
  const result = buildAllDepartmentsWorkPlansPDF(plans, weekStartDate);
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url; a.download = result.filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}


function renderDepartmentSection(
  doc: jsPDF,
  plan: DeptWorkPlanPDF,
  weekStart: Date,
  weekEnd: Date,
  pageW: number,
  pageH: number,
) {
  // Section header
  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold"); doc.setFontSize(14);
  doc.text(plan.departmentName, 14, 14);

  doc.setTextColor(0, 0, 0);
  let y = 32;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
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
  row("Status:", (plan.status || "").toUpperCase());
  if (plan.submittedAt) row("Submitted:", format(parseISO(plan.submittedAt), "PPp"));

  y += 4;

  // Build day rows
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
    styles: { fontSize: 9, cellPadding: 3, valign: "top", overflow: "linebreak" , fontStyle: "bold", textColor: [0,0,0] },
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

  let afterY = (doc as any).lastAutoTable.finalY + 10;
  const neededH = 55;
  if (afterY + neededH > pageH - 14) { doc.addPage(); afterY = 20; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Approval & Signatures", 14, afterY);
  doc.setDrawColor(180); doc.line(14, afterY + 2, pageW - 14, afterY + 2);
  afterY += 9;

  const colW = (pageW - 28 - 10) / 2;
  const leftX = 14;
  const rightX = 14 + colW + 10;

  const sigBlock = (x: number, title: string, nameLabel: string, nameValue: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(title, x, afterY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    let ly = afterY + 7;
    doc.text(`${nameLabel}: ${nameValue || "______________________"}`, x, ly); ly += 9;
    doc.text("Signature: ______________________", x, ly); ly += 9;
    doc.text("Date: ______________________", x, ly);
  };

  sigBlock(leftX, "Prepared By", "HOD Name", plan.hodName);
  sigBlock(rightX, "Approved By", "Diocesan Secretary", DIOCESAN_SECRETARY);
}
