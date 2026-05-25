import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, LogIn } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface OpenEntry {
  id: string;
  left_at: string;
}

export function OfficeAttendanceButton() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState<OpenEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("office_attendance")
      .select("id, left_at")
      .eq("user_id", user.id)
      .is("returned_at", null)
      .order("left_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpen((data as OpenEntry | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const leave = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("office_attendance").insert({
      user_id: user.id,
      department_id: profile?.department_id ?? null,
      left_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Marked as out of office"); load(); }
  };

  const back = async () => {
    if (!user || !open) return;
    setBusy(true);
    const { error } = await supabase
      .from("office_attendance")
      .update({ returned_at: new Date().toISOString() })
      .eq("id", open.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome back!"); load(); }
  };

  if (!user || loading) return null;

  if (open) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm">
        <span className="font-medium text-amber-900">
          Out since {format(new Date(open.left_at), "p")}
        </span>
        <Button size="sm" onClick={back} disabled={busy} className="h-7">
          <LogIn className="mr-1 h-3.5 w-3.5" /> I'm back
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={leave} disabled={busy}>
      <LogOut className="mr-1 h-3.5 w-3.5" /> Leave office
    </Button>
  );
}
