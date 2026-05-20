import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, endOfMonth, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface ReportTarget {
  userId: string;
  fullName: string;
  departmentName: string | null;
  position: string | null;
}

export async function generateMonthlyReportPDF(target: ReportTarget, year: number, monthIdx0: number) {
  const start = startOfMonth(new Date(year, monthIdx0, 1));
  const end = endOfMonth(start);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  const { data: plans } = await supabase
    .from("work_plans").select("id,week_start_date,status,submitted_at")
    .eq("user_id", target.userId)
    .gte("week_start_date", format(new Date(year, monthIdx0, 1), "yyyy-MM-dd"))
    .lte("week_start_date", endStr);

  const planIds = (plans ?? []).map((p: any) => p.id);
  const { data: items } = planIds.length
    ? await supabase.from("work_plan_items").select("*").in("work_plan_id", planIds).order("activity_date")
    : { data: [] as any[] };

  const { data: vehicles } = await supabase
    .from("vehicle_requests").select("*").eq("user_id", target.userId)
    .gte("date_needed", startStr).lte("date_needed", endStr).order("date_needed");

  const { data: logs } = await supabase
    .from("daily_logs").select("*").eq("user_id", target.userId)
    .gte("log_date", startStr).lte("log_date", endStr).order("log_date");

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(89, 25, 32);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 248, 220);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text("Catholic Diocese of Kitale", 14, 14);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text("Secretariat — Monthly Activity Report", 14, 22);

  doc.setTextColor(40, 30, 30);
  doc.setFontSize(11);
  let y = 38;
  doc.setFont("helvetica", "bold");
  doc.text(`${format(start, "MMMM yyyy")}`, 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Name: ${target.fullName}`, 14, y); y += 5;
  doc.text(`Department: ${target.departmentName ?? "—"}`, 14, y); y += 5;
  if (target.position) { doc.text(`Position: ${target.position}`, 14, y); y += 5; }
  y += 3;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Summary", 14, y); y += 2;
  doc.setDrawColor(200); doc.line(14, y, pageW - 14, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const totalActivities = items?.length ?? 0;
  const totalVehicles = vehicles?.length ?? 0;
  const approvedVehicles = (vehicles ?? []).filter((v: any) => v.status === "approved").length;
  const totalMoney = (items ?? []).reduce((s: number, i: any) => s + (Number(i.money_amount) || 0), 0);
  doc.text(`Planned activities: ${totalActivities}`, 14, y); y += 5;
  doc.text(`Vehicle requests: ${totalVehicles} (${approvedVehicles} approved)`, 14, y); y += 5;
  doc.text(`Estimated funds requested: KES ${totalMoney.toLocaleString()}`, 14, y); y += 5;
  doc.text(`Days logged: ${logs?.length ?? 0}`, 14, y); y += 8;

  // Activities table
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Activities", 14, y); y += 2;
  autoTable(doc, {
    startY: y + 2,
    head: [["Date", "Activity", "Location", "Vehicle", "Money (KES)"]],
    body: (items ?? []).map((i: any) => [
      format(parseISO(i.activity_date), "MMM d"),
      i.activity,
      i.location ?? "",
      i.needs_vehicle ? "Yes" : "No",
      i.money_amount ? Number(i.money_amount).toLocaleString() : "",
    ]),
    headStyles: { fillColor: [89, 25, 32], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2 },
  });

  // Vehicle requests
  y = (doc as any).lastAutoTable.finalY + 10;
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Vehicle Requests", 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "Destination", "Purpose", "Status"]],
    body: (vehicles ?? []).map((v: any) => [
      format(parseISO(v.date_needed), "MMM d"),
      v.destination,
      v.purpose,
      v.status,
    ]),
    headStyles: { fillColor: [89, 25, 32], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2 },
  });

  // Achievements & challenges
  y = (doc as any).lastAutoTable.finalY + 10;
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Daily Achievements & Challenges", 14, y); y += 4;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  (logs ?? []).forEach((l: any) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.text(format(parseISO(l.log_date), "EEEE, MMM d"), 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    if (l.achievements) { const lines = doc.splitTextToSize(`Achievements: ${l.achievements}`, pageW - 28); doc.text(lines, 14, y); y += lines.length * 4 + 1; }
    if (l.challenges) { const lines = doc.splitTextToSize(`Challenges: ${l.challenges}`, pageW - 28); doc.text(lines, 14, y); y += lines.length * 4 + 2; }
  });

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Generated ${format(new Date(), "PPp")} — Page ${i} of ${pages}`, 14, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`Monthly_Report_${target.fullName.replace(/\s+/g, "_")}_${format(start, "yyyy-MM")}.pdf`);
}
