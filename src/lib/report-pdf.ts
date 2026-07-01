import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, endOfMonth, startOfMonth, startOfWeek, endOfWeek, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface ReportTarget {
  userId: string;
  fullName: string;
  departmentId?: string | null;
  departmentName: string | null;
  position: string | null;
  hodName?: string | null;
}

const DIOCESAN_SECRETARY = "REV. FR. JAMES ORANGA";

export type ReportPeriod =
  | { kind: "monthly"; year: number; monthIdx0: number }
  | { kind: "weekly"; weekStart: Date };

function rangeFor(period: ReportPeriod): { start: Date; end: Date; label: string; filename: string } {
  if (period.kind === "monthly") {
    const start = startOfMonth(new Date(period.year, period.monthIdx0, 1));
    const end = endOfMonth(start);
    return { start, end, label: format(start, "MMMM yyyy"), filename: `Monthly_Report_${format(start, "yyyy-MM")}` };
  }
  const start = startOfWeek(period.weekStart, { weekStartsOn: 1 });
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return { start, end, label: `Week of ${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`, filename: `Weekly_Report_${format(start, "yyyy-MM-dd")}` };
}

export async function generateReportPDF(target: ReportTarget, period: ReportPeriod) {
  const { start, end, label, filename } = rangeFor(period);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  // For weekly, work plans are keyed by week_start_date; fetch any plan whose week overlaps the range.
  const { data: plans } = await supabase
    .from("work_plans").select("id,week_start_date,status,submitted_at")
    .eq("user_id", target.userId)
    .gte("week_start_date", startStr)
    .lte("week_start_date", endStr);

  const planIds = (plans ?? []).map((p: any) => p.id);
  const { data: items } = planIds.length
    ? await supabase.from("work_plan_items").select("*").in("work_plan_id", planIds).gte("activity_date", startStr).lte("activity_date", endStr).order("activity_date")
    : { data: [] as any[] };

  const { data: vehicles } = await supabase
    .from("vehicle_requests").select("*").eq("user_id", target.userId)
    .gte("date_needed", startStr).lte("date_needed", endStr).order("date_needed");

  const { data: logs } = await supabase
    .from("daily_logs").select("*").eq("user_id", target.userId)
    .gte("log_date", startStr).lte("log_date", endStr).order("log_date");

  // Finance requests submitted by this user within the period
  const { data: financeRequests } = await supabase
    .from("finance_requests")
    .select("*")
    .eq("requester_id", target.userId)
    .gte("submitted_at", start.toISOString())
    .lte("submitted_at", end.toISOString())
    .order("submitted_at");

  // Approved driver-log trips for the target's department (if known) — these are trips the
  // department actually made and the HOD approved. They are summarised separately so reports
  // include destinations, fuel litres, money, driver, vehicle and conditions per trip.
  let deptTrips: any[] = [];
  let driverNames: Record<string, string> = {};
  let vehicleLabels: Record<string, string> = {};
  if (target.departmentId) {
    const { data: trips } = await supabase
      .from("driver_logs")
      .select("*")
      .eq("status", "approved")
      .eq("department_id", target.departmentId)
      .gte("log_date", startStr)
      .lte("log_date", endStr)
      .order("log_date");
    deptTrips = trips ?? [];
    const driverIds = Array.from(new Set(deptTrips.map((t: any) => t.user_id).filter(Boolean)));
    const vehicleIds = Array.from(new Set(deptTrips.map((t: any) => t.vehicle_id).filter(Boolean)));
    if (driverIds.length) {
      const { data: dps } = await supabase.from("profiles").select("id,full_name").in("id", driverIds);
      ((dps as any[]) ?? []).forEach((p) => { driverNames[p.id] = p.full_name; });
    }
    if (vehicleIds.length) {
      const { data: vs } = await supabase.from("vehicles").select("id,registration,make_model").in("id", vehicleIds);
      ((vs as any[]) ?? []).forEach((v) => {
        vehicleLabels[v.id] = `${v.registration}${v.make_model ? " · " + v.make_model : ""}`;
      });
    }
  }

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(89, 25, 32);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 248, 220);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text("Catholic Diocese of Kitale", 14, 14);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text(`Secretariat — ${period.kind === "weekly" ? "Weekly" : "Monthly"} Activity Report`, 14, 22);

  doc.setTextColor(40, 30, 30);
  doc.setFontSize(11);
  let y = 38;
  doc.setFont("helvetica", "bold");
  doc.text(label, 14, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Name: ${target.fullName}`, 14, y); y += 5;
  doc.text(`Department: ${target.departmentName ?? "—"}`, 14, y); y += 5;
  if (target.position) { doc.text(`Position: ${target.position}`, 14, y); y += 5; }
  y += 3;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Summary", 14, y); y += 2;
  doc.setDrawColor(200); doc.line(14, y, pageW - 14, y); y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  const totalActivities = items?.length ?? 0;
  const totalVehicles = vehicles?.length ?? 0;
  const approvedVehicles = (vehicles ?? []).filter((v: any) => v.status === "approved").length;
  const rejectedVehicles = (vehicles ?? []).filter((v: any) => v.status === "rejected").length;
  const pendingVehicles = totalVehicles - approvedVehicles - rejectedVehicles;
  const totalMoney = (items ?? []).reduce((s: number, i: any) => s + (Number(i.money_amount) || 0), 0);

  const finReqs = financeRequests ?? [];
  const finTotal = finReqs.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
  const finApproved = finReqs.filter((r: any) => r.status === "approved");
  const finApprovedAmt = finApproved.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
  const finRejected = finReqs.filter((r: any) => r.status === "rejected");
  const finRejectedAmt = finRejected.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
  const finPending = finReqs.filter((r: any) => r.status !== "approved" && r.status !== "rejected" && r.status !== "cancelled");
  const finPendingAmt = finPending.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);

  doc.text(`Planned activities: ${totalActivities}  ·  Estimated funds in plan: KES ${totalMoney.toLocaleString()}`, 14, y); y += 5;
  doc.text(`Vehicle requests: ${totalVehicles}  (approved ${approvedVehicles}, rejected ${rejectedVehicles}, pending ${pendingVehicles})`, 14, y); y += 5;
  doc.text(`Finance requests: ${finReqs.length}  ·  Total requested: KES ${finTotal.toLocaleString()}`, 14, y); y += 5;
  doc.text(`  Approved: KES ${finApprovedAmt.toLocaleString()}  ·  Pending: KES ${finPendingAmt.toLocaleString()}  ·  Rejected: KES ${finRejectedAmt.toLocaleString()}`, 14, y); y += 5;
  doc.text(`Days logged: ${logs?.length ?? 0}`, 14, y); y += 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Work Plan Activities", 14, y); y += 2;
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
    foot: totalActivities ? [["", "", "", "Total", totalMoney.toLocaleString()]] : undefined,
    headStyles: { fillColor: [89, 25, 32], textColor: 255 },
    footStyles: { fillColor: [240, 230, 215], textColor: 40, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 , fontStyle: "bold", textColor: [0,0,0] },
  });

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
    foot: totalVehicles ? [[
      `Total: ${totalVehicles}`,
      `Approved: ${approvedVehicles}`,
      `Pending: ${pendingVehicles}`,
      `Rejected: ${rejectedVehicles}`,
    ]] : undefined,
    headStyles: { fillColor: [89, 25, 32], textColor: 255 },
    footStyles: { fillColor: [240, 230, 215], textColor: 40, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 , fontStyle: "bold", textColor: [0,0,0] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Finance Requests
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(40, 30, 30);
  doc.text("Finance Requests", 14, y);
  if (finReqs.length === 0) {
    autoTable(doc, {
      startY: y + 4,
      head: [["Serial", "Submitted", "Items", "Status", "Amount (KES)"]],
      body: [["—", "—", "No finance requests in this period", "—", "—"]],
      headStyles: { fillColor: [89, 25, 32], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2 , fontStyle: "bold", textColor: [0,0,0] },
    });
  } else {
    autoTable(doc, {
      startY: y + 4,
      head: [["Serial", "Submitted", "Items", "Status", "Amount (KES)"]],
      body: finReqs.map((r: any) => {
        const itemCount = Array.isArray(r.items) ? r.items.length : 0;
        const firstItem = Array.isArray(r.items) && r.items[0] ? String(r.items[0].activity ?? "") : "";
        const summary = itemCount > 1 ? `${firstItem} (+${itemCount - 1} more)` : firstItem || "—";
        return [
          r.serial_number ?? "—",
          format(parseISO(r.submitted_at), "MMM d"),
          summary,
          r.status,
          Number(r.total_amount ?? 0).toLocaleString(),
        ];
      }),
      foot: [[
        `${finReqs.length} request${finReqs.length === 1 ? "" : "s"}`,
        "",
        `Approved: KES ${finApprovedAmt.toLocaleString()}  |  Pending: KES ${finPendingAmt.toLocaleString()}  |  Rejected: KES ${finRejectedAmt.toLocaleString()}`,
        "Total",
        finTotal.toLocaleString(),
      ]],
      headStyles: { fillColor: [89, 25, 32], textColor: 255 },
      footStyles: { fillColor: [240, 230, 215], textColor: 40, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 2 , fontStyle: "bold", textColor: [0,0,0] },
    });
  }
  y = (doc as any).lastAutoTable.finalY + 10;

  // Departmental approved trips (from drivers log)
  if (deptTrips.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(40, 30, 30);
    doc.text("Departmental Trips (Drivers Log — Approved)", 14, y);

    const distanceOf = (t: any) => t.closing_km != null ? Number(t.closing_km) - Number(t.starting_km) : 0;
    autoTable(doc, {
      startY: y + 4,
      head: [["Date", "From → To", "Driver", "Vehicle", "KM", "Fuel L", "Fuel KES", "Condition"]],
      body: deptTrips.map((t: any) => [
        format(parseISO(t.log_date), "MMM d"),
        `${t.start_point} → ${t.destination}`,
        driverNames[t.user_id] ?? "—",
        vehicleLabels[t.vehicle_id] ?? "—",
        t.closing_km != null ? distanceOf(t).toFixed(1) : "—",
        t.fuel_litres != null ? Number(t.fuel_litres).toFixed(2) : "—",
        t.fuel_order_amount != null ? Number(t.fuel_order_amount).toLocaleString() : "—",
        [t.condition_start ? `Start: ${t.condition_start}` : "", t.condition_end ? `End: ${t.condition_end}` : ""].filter(Boolean).join(" | ") || "—",
      ]),
      headStyles: { fillColor: [89, 25, 32], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 , fontStyle: "bold", textColor: [0,0,0] },
    });

    const tripTotals = deptTrips.reduce(
      (a: any, t: any) => ({
        km: a.km + distanceOf(t),
        litres: a.litres + Number(t.fuel_litres ?? 0),
        money: a.money + Number(t.fuel_order_amount ?? 0),
      }),
      { km: 0, litres: 0, money: 0 }
    );
    y = (doc as any).lastAutoTable.finalY + 4;
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(
      `Trip totals — ${deptTrips.length} trip${deptTrips.length === 1 ? "" : "s"}, ${tripTotals.km.toFixed(1)} km, ${tripTotals.litres.toFixed(2)} L fuel, KES ${tripTotals.money.toLocaleString()}`,
      14,
      y
    );
    y += 8;
  }

  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(40, 30, 30);
  doc.text("Daily Achievements & Challenges", 14, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  (logs ?? []).forEach((l: any) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.text(format(parseISO(l.log_date), "EEEE, MMM d"), 14, y); y += 5;
    doc.setFont("helvetica", "bold");
    if (l.achievements) { const lines = doc.splitTextToSize(`Achievements: ${l.achievements}`, pageW - 28); doc.text(lines, 14, y); y += lines.length * 4 + 1; }
    if (l.challenges) { const lines = doc.splitTextToSize(`Challenges: ${l.challenges}`, pageW - 28); doc.text(lines, 14, y); y += lines.length * 4 + 2; }
  });
  let sigY = y + 20;
  const pageH = doc.internal.pageSize.getHeight();
  if (sigY > pageH - 40) { doc.addPage(); sigY = 40; }
  doc.setTextColor(40, 30, 30);
  doc.setDrawColor(120);
  doc.line(14, sigY, 90, sigY);
  doc.line(pageW - 90, sigY, pageW - 14, sigY);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(target.hodName ?? "—", 14, sigY + 5);
  doc.text(DIOCESAN_SECRETARY, pageW - 90, sigY + 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(0);
  doc.text(`HOD — ${target.departmentName ?? "Department"}`, 14, sigY + 10);
  doc.text("Diocesan Secretary", pageW - 90, sigY + 10);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(60);
    doc.text(`Generated ${format(new Date(), "PPp")} — Page ${i} of ${pages}`, 14, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`${filename}_${target.fullName.replace(/\s+/g, "_")}.pdf`);
}

// Backwards compatible wrapper
export async function generateMonthlyReportPDF(target: ReportTarget, year: number, monthIdx0: number) {
  return generateReportPDF(target, { kind: "monthly", year, monthIdx0 });
}

export async function generateWeeklyReportPDF(target: ReportTarget, weekStart: Date) {
  return generateReportPDF(target, { kind: "weekly", weekStart });
}

// silence unused import in some builds
void addDays;
