import jsPDF from "jspdf";
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
  email?: string | null;
  departmentName?: string | null;
  position?: string | null;
  hodName?: string | null;
}

const DIOCESAN_SECRETARY = "REV. FR. JAMES ORANGA";

export function downloadVehicleRequestPDF(req: VehicleRequestPDF, requester: VehicleRequester) {
  const doc = new jsPDF();
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
  doc.text("Secretariat — Vehicle Request Form", 14, 22);

  doc.setTextColor(30, 30, 30);
  let y = 44;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Request Details", 14, y); y += 2;
  doc.setDrawColor(180); doc.line(14, y, pageW - 14, y); y += 8;

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "—", pageW - 70);
    doc.text(lines, 60, y);
    y += Math.max(7, lines.length * 5 + 2);
  };

  row("Requester:", requester.fullName);
  if (requester.email) row("Email:", requester.email);
  if (requester.departmentName) row("Department:", requester.departmentName);
  if (requester.position) row("Position:", requester.position);
  row("Date submitted:", format(parseISO(req.created_at), "PPp"));

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Trip Information", 14, y); y += 2;
  doc.line(14, y, pageW - 14, y); y += 8;

  row("Date needed:", format(parseISO(req.date_needed), "EEEE, MMM d, yyyy"));
  row("Time:", req.time_from ? `${req.time_from} – ${req.time_to ?? ""}` : "—");
  row("Destination:", req.destination);
  row("Passengers:", String(req.passengers ?? 1));
  row("Purpose:", req.purpose);

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Approval Status", 14, y); y += 2;
  doc.line(14, y, pageW - 14, y); y += 8;

  row("Status:", req.status.toUpperCase());
  if (req.approved_at) row("Decision date:", format(parseISO(req.approved_at), "PPp"));
  if (req.approver_notes) row("Secretary's note:", req.approver_notes);

  y = Math.max(y + 24, 230);
  doc.setDrawColor(120);
  doc.line(14, y, 90, y);
  doc.line(pageW - 90, y, pageW - 14, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(requester.hodName ?? "—", 14, y + 5);
  doc.text(DIOCESAN_SECRETARY, pageW - 90, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(80);
  doc.text(`HOD — ${requester.departmentName ?? "Department"}`, 14, y + 10);
  doc.text("Diocesan Secretary", pageW - 90, y + 10);

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Generated ${format(new Date(), "PPp")}`, 14, doc.internal.pageSize.getHeight() - 8);

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Generated ${format(new Date(), "PPp")}`, 14, doc.internal.pageSize.getHeight() - 8);

  const filename = `Vehicle_Request_${format(parseISO(req.date_needed), "yyyy-MM-dd")}_${requester.fullName.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
