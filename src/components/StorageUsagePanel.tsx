import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchUsageSnapshot, formatBytes, type UsageSnapshot } from "@/lib/storage-usage";
import { toast } from "sonner";
import { RefreshCw, Database, HardDrive } from "lucide-react";

function Bar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = clamped > 85 ? "bg-red-600" : clamped > 60 ? "bg-amber-500" : "bg-emerald-600";
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${color} transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function fmtYears(y: number | null): string {
  if (y == null) return "No growth yet";
  if (!isFinite(y)) return "—";
  if (y > 100) return "100+ years";
  if (y >= 2) return `${y.toFixed(1)} years`;
  const months = y * 12;
  if (months >= 2) return `${months.toFixed(1)} months`;
  return `${(months * 30).toFixed(0)} days`;
}

export function StorageUsagePanel() {
  const [snap, setSnap] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setSnap(await fetchUsageSnapshot());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load usage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">System capacity</h2>
          <p className="text-xs text-muted-foreground">
            Free tier: 500 MB database, 1 GB storage. Projection uses current data divided by days since the oldest record.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {!snap ? (
        <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Database</CardTitle>
              <CardDescription>Tables, rows, indexes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>{formatBytes(snap.db.bytes)} of {formatBytes(snap.db.limitBytes)}</span>
                <span className="font-medium">{snap.db.usedPct.toFixed(1)}%</span>
              </div>
              <Bar pct={snap.db.usedPct} />
              <dl className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <dt className="text-muted-foreground">Growth rate</dt>
                <dd className="text-right">{formatBytes(Math.round(snap.db.bytesPerDay))} / day</dd>
                <dt className="text-muted-foreground">Sampled over</dt>
                <dd className="text-right">{snap.db.daysOldest} days</dd>
                <dt className="text-muted-foreground">Years until full</dt>
                <dd className="text-right font-semibold">{fmtYears(snap.db.yearsRemaining)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><HardDrive className="h-4 w-4" /> Storage</CardTitle>
              <CardDescription>Uploaded files & saved PDFs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>{formatBytes(snap.storage.bytes)} of {formatBytes(snap.storage.limitBytes)}</span>
                <span className="font-medium">{snap.storage.usedPct.toFixed(2)}%</span>
              </div>
              <Bar pct={snap.storage.usedPct} />
              <dl className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <dt className="text-muted-foreground">Objects</dt>
                <dd className="text-right">{snap.storage.objectCount.toLocaleString()}</dd>
                <dt className="text-muted-foreground">Growth rate</dt>
                <dd className="text-right">{formatBytes(Math.round(snap.storage.bytesPerDay))} / day</dd>
                <dt className="text-muted-foreground">Sampled over</dt>
                <dd className="text-right">{snap.storage.daysOldest} days</dd>
                <dt className="text-muted-foreground">Years until full</dt>
                <dd className="text-right font-semibold">{fmtYears(snap.storage.yearsRemaining)}</dd>
              </dl>
            </CardContent>
          </Card>

          {snap.storage.buckets.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Storage breakdown by bucket</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y text-sm">
                  {snap.storage.buckets.map((b) => (
                    <div key={b.name} className="flex items-center justify-between py-2">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted-foreground">{b.objects} files · {formatBytes(b.bytes)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="md:col-span-2 text-xs text-muted-foreground">
            Snapshot taken {new Date(snap.generatedAt).toLocaleString()}. Projection is linear from current data — actual growth can rise as more users and activities are added.
          </p>
        </div>
      )}
    </div>
  );
}
