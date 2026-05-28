import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface Notification {
  kind: "plan" | "log" | "vehicle" | "leave" | "driver";
  id: string;
  user: string;
  label: string;
  when: string;
  to: string;
}

export function NotificationBell() {
  const { user, isSuperAdmin } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);


  const load = async () => {
    const [{ data: plans }, { data: logs }, { data: vehs }, { data: leaves }, { data: dlogs }, { data: ppl }] =
      await Promise.all([
        supabase.from("work_plans").select("id,user_id,week_start_date,submitted_at,status").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(15),
        supabase.from("daily_logs").select("id,user_id,log_date,created_at").order("created_at", { ascending: false }).limit(15),
        supabase.from("vehicle_requests").select("id,user_id,destination,date_needed,created_at").order("created_at", { ascending: false }).limit(15),
        supabase.from("leave_requests").select("id,user_id,applicant_name,from_date,created_at").order("created_at", { ascending: false }).limit(15),
        supabase.from("driver_logs").select("id,user_id,destination,log_date,created_at").order("created_at", { ascending: false }).limit(15),
        supabase.from("profiles").select("id,full_name"),
      ]);

    const nameOf = (id: string) => (ppl as any[] | null)?.find((p) => p.id === id)?.full_name ?? "Someone";
    const merged: Notification[] = [
      ...((plans as any[]) ?? []).map((p) => ({
        kind: "plan" as const, id: p.id, user: nameOf(p.user_id),
        label: `submitted a work plan for week of ${format(new Date(p.week_start_date), "MMM d")}`,
        when: p.submitted_at ?? p.week_start_date, to: "/admin",
      })),
      ...((logs as any[]) ?? []).map((l) => ({
        kind: "log" as const, id: l.id, user: nameOf(l.user_id),
        label: `added a daily log for ${format(new Date(l.log_date), "MMM d")}`,
        when: l.created_at, to: "/admin",
      })),
      ...((vehs as any[]) ?? []).map((v) => ({
        kind: "vehicle" as const, id: v.id, user: nameOf(v.user_id),
        label: `requested a vehicle to ${v.destination} (${format(new Date(v.date_needed), "MMM d")})`,
        when: v.created_at, to: "/vehicle-requests",
      })),
      ...((leaves as any[]) ?? []).map((lv) => ({
        kind: "leave" as const, id: lv.id, user: lv.applicant_name ?? nameOf(lv.user_id),
        label: `applied for leave starting ${format(new Date(lv.from_date), "MMM d")}`,
        when: lv.created_at, to: "/leave-requests",
      })),
      ...((dlogs as any[]) ?? []).map((d) => ({
        kind: "driver" as const, id: d.id, user: nameOf(d.user_id),
        label: `submitted a driver's log to ${d.destination} (${format(new Date(d.log_date), "MMM d")})`,
        when: d.created_at, to: "/drivers-log",
      })),
    ]
      .sort((a, b) => +new Date(b.when) - +new Date(a.when));

    const readIds = getReadIds();
    const visible = merged
      .filter((i) => !readIds.has(`${i.kind}-${i.id}`))
      .slice(0, 25);

    setItems(visible);
  };

  useEffect(() => {
    if (!user || !isSuperAdmin) return;
    load();
    const channel = supabase
      .channel("notif-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_plans" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "daily_logs" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vehicle_requests" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leave_requests" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_logs" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isSuperAdmin]);

  if (!isSuperAdmin) return null;

  const unreadCount = items.length;

  const markSeen = () => {
    if (items.length === 0) return;
    const readIds = getReadIds();
    items.forEach((i) => readIds.add(`${i.kind}-${i.id}`));
    saveReadIds(readIds);
  };

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      markSeen();
      await load();
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
        <div className="px-3 py-2 border-b">
          <p className="font-semibold text-sm">Notifications</p>
          <p className="text-xs text-muted-foreground">Recent submissions across the diocese</p>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No new notifications.</p>
        ) : (
          items.map((n) => (
            <Link
              key={`${n.kind}-${n.id}`}
              to={n.to}
              className="block px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/60 transition-colors bg-primary/5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground">
                  <span className="font-semibold">{n.user}</span> {n.label}
                </p>
                <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 shrink-0">new</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{format(new Date(n.when), "PPp")}</p>
            </Link>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
