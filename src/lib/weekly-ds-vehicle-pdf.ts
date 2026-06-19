import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

export interface DSWeeklyVRRow {
  department: string;
  date_needed: string;
  from: string;
  destination: string;
  purpose?: string | null;
  passengers?: number | null;
  vehicle?: string | null;
  driver?: string | null;
}

function sanitize(value: string): string {
  return (value || "")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2022/g, "*");
}

export function downloadDSWeeklyVehicleRequestsPDF(
  rows: DSWeeklyVRRow[],
  weekStartISO: string,
  weekEndISO: string,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header banner
  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold"); doc.setFontSize(18);
  doc.text("Catholic Diocese of Kitale", 14, 14);
  doc.setFont("times", "normal"); doc.setFontSize(11);
  doc.text("Office of the Diocesan Secretary - Weekly Vehicle Requests", 14, 22);

  doc.setTextColor(30, 30, 30);
  let y = 40;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(
    `Week: ${format(parseISO(weekStartISO), "EEEE, MMM d")} - ${format(parseISO(weekEndISO), "EEEE, MMM d, yyyy")}`,
    14,
    y,
  );
  y += 4;

  // Sort by date, then department, then destination so multi-trip departments stay together
  const sorted = [...rows].sort(
    (a, b) =>
      a.date_needed.localeCompare(b.date_needed) ||
      a.department.localeCompare(b.department) ||
      a.destination.localeCompare(b.destination),
  );

  autoTable(doc, {
    startY: y + 4,
    head: [["Department", "Day", "Date", "From", "Destination", "Vehicle", "Driver"]],
    body: sorted.map((r) => [
      sanitize(r.department || "-"),
      format(parseISO(r.date_needed), "EEEE"),
      format(parseISO(r.date_needed), "MMM d, yyyy"),
      sanitize(r.from || "-"),
      sanitize(r.destination || "-"),
      "", // blank for vehicle
      "", // blank for driver
    ]),
    styles: { fontSize: 9, cellPadding: 4, valign: "middle", minCellHeight: 12 },
    headStyles: { fillColor: [102, 0, 0], textColor: 255, halign: "center" },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 22 },
      2: { cellWidth: 28 },
      3: { cellWidth: 40 },
      4: { cellWidth: 50 },
      5: { cellWidth: 38 },
      6: { cellWidth: 38 },
    },
    margin: { left: 14, right: 14 },
  });

  let signY = (doc as any).lastAutoTable.finalY + 22;
  if (signY > pageH - 40) {
    doc.addPage();
    signY = 50;
  }

  doc.setDrawColor(120);
  doc.line(14, signY, 110, signY);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("REV. FR. JAMES ORANGA", 14, signY + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80);
  doc.text("Diocesan Secretary - Authorized", 14, signY + 10);

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Signature: ____________________________", pageW - 110, signY + 5);
  doc.text("Date: ____________________________", pageW - 110, signY + 15);

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Generated ${format(new Date(), "PPp")}`, 14, pageH - 8);

  const filename = `Weekly_Vehicle_Requests_${weekStartISO}_to_${weekEndISO}.pdf`;
  doc.save(filename);
}
