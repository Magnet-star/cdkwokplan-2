import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/daily-log")({
  component: DailyLogPage,
});

interface Log {
  id: string;
  log_date: string;
  challenges: string | null;
  achievements: string | null;
  recommendations: string | null;
}

function DailyLogPage() {
  const { user, profile } = useAuth();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [challenges, setChallenges] = useState("");
  const [achievements, setAchievements] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [list, setList] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("daily_logs").select("*").eq("user_id", user.id).order("log_date", { ascending: false }).limit(30);
    setList((data as Log[]) ?? []);
    const existing = (data as Log[] | null)?.find((l) => l.log_date === date);
    if (existing) {
      setChallenges(existing.challenges ?? "");
      setAchievements(existing.achievements ?? "");
      setRecommendations(existing.recommendations ?? "");
    } else {
      setChallenges(""); setAchievements(""); setRecommendations("");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, date]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("daily_logs").upsert({
      user_id: user.id,
      department_id: profile?.department_id ?? null,
      log_date: date,
      challenges: challenges || null,
      achievements: achievements || null,
      recommendations: recommendations || null,
    }, { onConflict: "user_id,log_date" });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Daily log saved"); load(); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-foreground">Daily Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Capture challenges and achievements each day. They feed into monthly reports.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-serif">Today's entry</CardTitle><CardDescription>Choose a date to view or edit.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Achievements</Label><Textarea rows={4} value={achievements} onChange={(e) => setAchievements(e.target.value)} placeholder="What went well today?" /></div>
          <div><Label>Challenges</Label><Textarea rows={4} value={challenges} onChange={(e) => setChallenges(e.target.value)} placeholder="What got in the way?" /></div>
          <div><Label>Recommendations</Label><Textarea rows={4} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} placeholder="Suggestions or recommendations going forward?" /></div>
          <Button onClick={save} disabled={busy}>Save entry</Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-serif text-xl">Recent entries</h2>
        <div className="mt-3 space-y-2">
          {list.length === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
          {list.map((l) => (
            <Card key={l.id}>
              <CardContent className="p-4">
                <p className="font-medium">{format(parseISO(l.log_date), "EEEE, MMM d, yyyy")}</p>
                {l.achievements && <p className="mt-1 text-sm"><span className="font-semibold text-success">Achievements:</span> {l.achievements}</p>}
                {l.challenges && <p className="mt-1 text-sm"><span className="font-semibold text-destructive">Challenges:</span> {l.challenges}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
