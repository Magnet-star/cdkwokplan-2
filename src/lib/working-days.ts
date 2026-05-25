import { eachDayOfInterval, format, isWeekend } from "date-fns";

// Kenya public holidays (fixed-date). Update yearly as needed.
// Format: MM-DD entries apply every year; YYYY-MM-DD entries apply to that year only.
const FIXED_HOLIDAYS: string[] = [
  "01-01", // New Year's Day
  "05-01", // Labour Day
  "06-01", // Madaraka Day
  "10-10", // Huduma / Mazingira Day
  "10-20", // Mashujaa Day
  "12-12", // Jamhuri Day
  "12-25", // Christmas Day
  "12-26", // Boxing Day / Utamaduni Day
];

// Movable / declared holidays (Good Friday, Easter Monday, Eid, etc.)
const DATED_HOLIDAYS: string[] = [
  // 2024
  "2024-03-29", "2024-04-01", "2024-04-10", "2024-06-17",
  // 2025
  "2025-04-18", "2025-04-21", "2025-03-31", "2025-06-07",
  // 2026
  "2026-04-03", "2026-04-06", "2026-03-20", "2026-05-27",
  // 2027
  "2027-03-26", "2027-03-29",
];

export function isPublicHoliday(date: Date): boolean {
  const md = format(date, "MM-dd");
  const ymd = format(date, "yyyy-MM-dd");
  return FIXED_HOLIDAYS.includes(md) || DATED_HOLIDAYS.includes(ymd);
}

export function countWorkingDays(from: Date, to: Date): number {
  if (to < from) return 0;
  const days = eachDayOfInterval({ start: from, end: to });
  return days.filter((d) => !isWeekend(d) && !isPublicHoliday(d)).length;
}
