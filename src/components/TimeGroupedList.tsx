import { useMemo, useState, type ReactNode } from "react";
import { startOfWeek, format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Props<T> {
  items: T[];
  getDate: (item: T) => Date | null;
  renderItem: (item: T) => ReactNode;
  keyOf: (item: T) => string;
  /** Label prefix for the month group, e.g. "Vehicle approvals" -> "Vehicle approvals this month (June 2026)" */
  groupLabel?: string;
  emptyMessage?: ReactNode;
}

type Bucket = { key: string; label: string; items: any[] };

export function TimeGroupedList<T>({ items, getDate, renderItem, keyOf, groupLabel, emptyMessage }: Props<T>) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const currentYear = now.getFullYear();

  const { current, months, years } = useMemo(() => {
    const cur: T[] = [];
    const mMap = new Map<string, Bucket>();
    const yMap = new Map<string, Bucket>();
    for (const it of items) {
      const d = getDate(it);
      if (!d || isNaN(d.getTime())) { cur.push(it); continue; }
      if (d >= weekStart) {
        cur.push(it);
      } else if (d.getFullYear() === currentYear) {
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = format(d, "MMMM yyyy");
        const b = mMap.get(key) ?? { key, label, items: [] };
        b.items.push(it);
        mMap.set(key, b);
      } else {
        const key = String(d.getFullYear());
        const b = yMap.get(key) ?? { key, label: key, items: [] };
        b.items.push(it);
        yMap.set(key, b);
      }
    }
    const months = Array.from(mMap.values()).sort((a, b) => b.key.localeCompare(a.key, undefined, { numeric: true }));
    const years = Array.from(yMap.values()).sort((a, b) => Number(b.key) - Number(a.key));
    return { current: cur, months, years };
  }, [items, getDate, weekStart, currentYear]);

  if (items.length === 0 && emptyMessage) {
    return <>{emptyMessage}</>;
  }

  return (
    <div className="space-y-4">
      {current.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This week</h3>
          {current.map((it) => <div key={keyOf(it)}>{renderItem(it)}</div>)}
        </div>
      )}
      {months.map((g) => (
        <CollapsibleGroup key={g.key} label={`${groupLabel ? groupLabel + " " : ""}this month (${g.label})`} count={g.items.length}>
          {g.items.map((it) => <div key={keyOf(it)}>{renderItem(it)}</div>)}
        </CollapsibleGroup>
      ))}
      {years.map((g) => (
        <CollapsibleGroup key={g.key} label={`${groupLabel ? groupLabel + " " : ""}for ${g.label}`} count={g.items.length}>
          {g.items.map((it) => <div key={keyOf(it)}>{renderItem(it)}</div>)}
        </CollapsibleGroup>
      ))}
    </div>
  );
}

function CollapsibleGroup({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <span className="text-sm font-medium capitalize">{label}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {count} {count === 1 ? "entry" : "entries"}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && <div className="space-y-3 border-t border-border p-3">{children}</div>}
    </div>
  );
}
