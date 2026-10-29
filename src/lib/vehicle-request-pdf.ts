import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

export interface VehicleRequestPDF {
  id: string;
  date_needed: string;
  time_from: string | null;
  time_to: string | null;
  destination: string;
  purpose: string;
  passengers: number | null;
  status: "pending" | "approved" | "rejected";
  approver_notes: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface VehicleRequester {
  fullName: string;
  departmentName?: string | null;
  position?: string | null;
  hodName?: string | null;
}

// Split a stored "Start -> Destination" string into parts.
// Some legacy records use the unicode arrow which jsPDF's standard fonts
// can't render (it shows as "!"), so we normalise to plain ASCII here.
function splitRoute(value: string): { start: string; end: string } {
  const cleaned = (value || "").replace(/\u2192/g, "->");
  const parts = cleaned.split(/\s*->\s*/);
  if (parts.length >= 2) return { start: parts[0].trim(), end: parts.slice(1).join(" -> ").trim() };
  return { start: "", end: cleaned.trim() };
}

// Replace any glyphs the built-in fonts can't render (which otherwise show as "!").
function sanitize(value: string): string {
  return (value || "")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2022/g, "*");
}

export function downloadVehicleRequestPDF(req: VehicleRequestPDF, requester: VehicleRequester, diocesanSecretaryName: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text("Catholic Diocese of Kitale", 14, 14);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text("Secretariat - Vehicle Request Form", 14, 22);

  doc.setTextColor(0, 0, 0);
  let y = 44;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Request Details", 14, y); y += 2;
  doc.setDrawColor(180); doc.line(14, y, pageW - 14, y); y += 8;

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(sanitize(value || "-"), pageW - 70);
    doc.text(lines, 60, y);
    y += Math.max(7, lines.length * 5 + 2);
  };

  const { start, end } = splitRoute(req.destination);

  row("Requester:", requester.fullName);
  if (requester.departmentName) row("Department:", requester.departmentName);
  if (requester.position) row("Position:", requester.position);
  row("Date submitted:", format(parseISO(req.created_at), "PPp"));

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Trip Information", 14, y); y += 2;
  doc.line(14, y, pageW - 14, y); y += 8;

  row("Date needed:", format(parseISO(req.date_needed), "EEEE, MMM d, yyyy"));
  row("Time:", req.time_from ? `${req.time_from} - ${req.time_to ?? ""}` : "-");
  row("Starting point:", start || "-");
  row("Destination:", end || "-");
  row("Passengers:", String(req.passengers ?? 1));
  row("Purpose:", req.purpose);

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Approval Status", 14, y); y += 2;
  doc.line(14, y, pageW - 14, y); y += 8;

  row("Status:", req.status.toUpperCase());
  if (req.approved_at) row("Decision date:", format(parseISO(req.approved_at), "PPp"));
  if (req.approver_notes) row("Secretary's note:", req.approver_notes);

  y = Math.max(y + 24, 160);
  doc.setDrawColor(120);
  doc.line(14, y, 90, y);
  doc.line(pageW - 90, y, pageW - 14, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(sanitize(requester.hodName ?? "-"), 14, y + 5);
  doc.text(diocesanSecretaryName, pageW - 90, y + 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(0);
  doc.text(`HOD - ${requester.departmentName ?? "Department"}`, 14, y + 10);
  doc.text("Diocesan Secretary", pageW - 90, y + 10);

  doc.setFontSize(8); doc.setTextColor(60);
  doc.text(`Generated ${format(new Date(), "PPp")}`, 14, doc.internal.pageSize.getHeight() - 8);

  const filename = `Vehicle_Request_${format(parseISO(req.date_needed), "yyyy-MM-dd")}_${requester.fullName.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}

export function downloadWeeklyVehicleRequestPDF(
  reqs: VehicleRequestPDF[],
  requester: VehicleRequester,
  weekStartISO: string,
  diocesanSecretaryName: string,
) {
  if (reqs.length === 0) return;
  if (reqs.length === 1) return downloadVehicleRequestPDF(reqs[0], requester, diocesanSecretaryName);

  const sorted = [...reqs].sort((a, b) => a.date_needed.localeCompare(b.date_needed));
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(102, 0, 0);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold"); doc.setFontSize(18);
  doc.text("Catholic Diocese of Kitale", 14, 14);
  doc.setFont("times", "normal"); doc.setFontSize(11);
  doc.text("Secretariat - Weekly Vehicle Request Form", 14, 22);

  doc.setTextColor(0, 0, 0);
  let y = 44;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Request Summary", 14, y); y += 2;
  doc.setDrawColor(180); doc.line(14, y, pageW - 14, y); y += 8;

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(sanitize(value || "-"), pageW - 70);
    doc.text(lines, 60, y);
    y += Math.max(7, lines.length * 5 + 2);
  };

  row("Requester:", requester.fullName);
  if (requester.departmentName) row("Department:", requester.departmentName);
  if (requester.position) row("Position:", requester.position);
  row("Week of:", format(parseISO(weekStartISO), "EEEE, MMM d, yyyy"));
  row("Total trips:", String(sorted.length));
  row("Date submitted:", format(parseISO(sorted[0].created_at), "PPp"));

  const statuses = Array.from(new Set(sorted.map((r) => r.status.toUpperCase())));
  row("Status:", statuses.join(" / "));

  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Trips for the week", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Time", "Starting point", "Destination", "Passengers", "Purpose", "Status"]],
    body: sorted.map((r) => {
      const { start, end } = splitRoute(r.destination);
      return [
        format(parseISO(r.date_needed), "EEE, MMM d"),
        r.time_from ? `${r.time_from}-${r.time_to ?? ""}` : "-",
        start || "-",
        end || "-",
        String(r.passengers ?? 1),
        sanitize(r.purpose),
        r.status.toUpperCase(),
      ];
    }),
    styles: { fontSize: 9, cellPadding: 3, valign: "top" , fontStyle: "bold", textColor: [0,0,0] },
    headStyles: { fillColor: [102, 0, 0], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 26 },
      2: { cellWidth: 45 },
      3: { cellWidth: 50 },
      4: { cellWidth: 24, halign: "center" },
      6: { cellWidth: 26 },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  const notes = Array.from(new Set(sorted.map((r) => r.approver_notes).filter(Boolean) as string[]));
  if (notes.length > 0) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Secretary's note(s):", 14, y); y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    notes.forEach((n) => {
      const lines = doc.splitTextToSize(`* ${sanitize(n)}`, pageW - 28);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 2;
    });
    y += 4;
  }

  const pageH = doc.internal.pageSize.getHeight();
  let signY = Math.max(y + 20, pageH - 50);
  if (signY > pageH - 40) { doc.addPage(); signY = 60; }

  doc.setDrawColor(120);
  doc.line(14, signY, 90, signY);
  doc.line(pageW - 90, signY, pageW - 14, signY);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(sanitize(requester.hodName ?? "-"), 14, signY + 5);
  doc.text(diocesanSecretaryName, pageW - 90, signY + 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(0);
  doc.text(`HOD - ${requester.departmentName ?? "Department"}`, 14, signY + 10);
  doc.text("Diocesan Secretary", pageW - 90, signY + 10);

  doc.setFontSize(8); doc.setTextColor(60);
  doc.text(`Generated ${format(new Date(), "PPp")}`, 14, pageH - 8);

  const filename = `Vehicle_Request_Week_${format(parseISO(weekStartISO), "yyyy-MM-dd")}_${requester.fullName.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
