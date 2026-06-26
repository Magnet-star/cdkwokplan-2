import { supabase } from "@/integrations/supabase/client";

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

export async function fetchUsageSnapshot(): Promise<UsageSnapshot> {
  const { data, error } = await supabase.rpc("get_storage_db_usage" as any);
  if (error) throw error;
  const r = data as any;

  const dbBytes = Number(r.db_bytes ?? 0);
  const storageBytes = Number(r.storage_bytes ?? 0);
  const storageObjects = Number(r.storage_objects ?? 0);
  const oldestDb = r.oldest_db ? new Date(r.oldest_db) : new Date();
  const oldestStorage = r.oldest_storage ? new Date(r.oldest_storage) : new Date();

  const daysOldestDb = Math.max(1, Math.round((Date.now() - oldestDb.getTime()) / 86400000));
  const daysOldestStorage = Math.max(1, Math.round((Date.now() - oldestStorage.getTime()) / 86400000));
  const dbPerDay = dbBytes / daysOldestDb;
  const storagePerDay = storageObjects > 0 ? storageBytes / daysOldestStorage : 0;
  const dbYears = dbPerDay > 0 ? Math.max(0, DB_LIMIT - dbBytes) / dbPerDay / 365 : null;
  const storageYears = storagePerDay > 0 ? Math.max(0, STORAGE_LIMIT - storageBytes) / storagePerDay / 365 : null;

  return {
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
      objectCount: storageObjects,
      bytesPerDay: storagePerDay,
      daysOldest: daysOldestStorage,
      yearsRemaining: storageYears,
      buckets: (r.buckets ?? []).map((b: any) => ({
        name: String(b.name),
        bytes: Number(b.bytes),
        objects: Number(b.objects),
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
