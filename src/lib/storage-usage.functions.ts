import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface UsageSnapshot {
  db: {
    bytes: number;
    limitBytes: number;
    usedPct: number;
    bytesPerDay: number;
    daysOldest: number;
    yearsRemaining: number | null;
  };
  storage: {
    bytes: number;
    limitBytes: number;
    usedPct: number;
    objectCount: number;
    bytesPerDay: number;
    daysOldest: number;
    yearsRemaining: number | null;
    buckets: { name: string; bytes: number; objects: number }[];
  };
  generatedAt: string;
}

const DB_LIMIT = 500 * 1024 * 1024; // 500 MB free tier
const STORAGE_LIMIT = 1024 * 1024 * 1024; // 1 GB free tier

export const getUsageSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // DB size
    const { data: dbRow } = await supabaseAdmin.rpc("exec_sql" as any, {}).then(
      () => ({ data: null }),
      () => ({ data: null })
    );
    void dbRow;

    // Use a raw query via postgres-meta-style: fall back to a SQL function if available,
    // else estimate from known tables.
    let dbBytes = 0;
    try {
      const { data } = await (supabaseAdmin as any)
        .from("pg_database_size_view")
        .select("size")
        .maybeSingle();
      if (data?.size) dbBytes = Number(data.size);
    } catch {}

    if (!dbBytes) {
      // Estimate: sum of row counts × avg row size for biggest tables.
      const tables = [
        "finance_requests",
        "work_plans",
        "work_plan_items",
        "vehicle_requests",
        "driver_logs",
        "daily_logs",
        "office_attendance",
        "profiles",
        "leave_requests",
        "clergy_members",
        "diocesan_events",
      ];
      let estimate = 0;
      for (const t of tables) {
        const { count } = await (supabaseAdmin as any)
          .from(t)
          .select("*", { count: "exact", head: true });
        estimate += (count ?? 0) * 1500; // ~1.5 KB avg incl. indexes/overhead
      }
      dbBytes = estimate + 20 * 1024 * 1024; // +20 MB baseline for system tables
    }

    // Oldest DB record (use earliest profile or work_plan)
    const { data: oldestProfile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const oldestDbDate = oldestProfile?.created_at ? new Date(oldestProfile.created_at) : new Date();
    const daysOldestDb = Math.max(
      1,
      Math.round((Date.now() - oldestDbDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    const dbPerDay = dbBytes / daysOldestDb;
    const dbRemaining = Math.max(0, DB_LIMIT - dbBytes);
    const dbYears = dbPerDay > 0 ? dbRemaining / dbPerDay / 365 : null;

    // Storage objects
    const { data: objects } = await (supabaseAdmin as any).schema("storage")
      .from("objects")
      .select("bucket_id, metadata, created_at");

    const objs = (objects as any[]) ?? [];
    let storageBytes = 0;
    let oldestStorageMs = Date.now();
    const bucketMap: Record<string, { bytes: number; objects: number }> = {};
    for (const o of objs) {
      const size = Number(o.metadata?.size ?? 0);
      storageBytes += size;
      const created = o.created_at ? new Date(o.created_at).getTime() : Date.now();
      if (created < oldestStorageMs) oldestStorageMs = created;
      const b = o.bucket_id ?? "unknown";
      if (!bucketMap[b]) bucketMap[b] = { bytes: 0, objects: 0 };
      bucketMap[b].bytes += size;
      bucketMap[b].objects += 1;
    }
    const daysOldestStorage = Math.max(
      1,
      Math.round((Date.now() - oldestStorageMs) / (1000 * 60 * 60 * 24))
    );
    const storagePerDay = objs.length > 0 ? storageBytes / daysOldestStorage : 0;
    const storageRemaining = Math.max(0, STORAGE_LIMIT - storageBytes);
    const storageYears = storagePerDay > 0 ? storageRemaining / storagePerDay / 365 : null;

    const snapshot: UsageSnapshot = {
      db: {
        bytes: dbBytes,
        limitBytes: DB_LIMIT,
        usedPct: (dbBytes / DB_LIMIT) * 100,
        bytesPerDay: dbPerDay,
        daysOldest: daysOldestDb,
        yearsRemaining: dbYears,
      },
      storage: {
        bytes: storageBytes,
        limitBytes: STORAGE_LIMIT,
        usedPct: (storageBytes / STORAGE_LIMIT) * 100,
        objectCount: objs.length,
        bytesPerDay: storagePerDay,
        daysOldest: daysOldestStorage,
        yearsRemaining: storageYears,
        buckets: Object.entries(bucketMap)
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.bytes - a.bytes),
      },
      generatedAt: new Date().toISOString(),
    };
    return snapshot;
  });
