export type PeriodKey = "today" | "week" | "month" | "custom";

export interface Period {
  start: Date;
  end: Date;
}

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Current period and the immediately preceding period of equal length, for like-for-like comparison. */
export function resolvePeriod(key: PeriodKey, now: Date, custom?: { from: string; to: string }): { current: Period; previous: Period } {
  let start: Date;
  let end: Date;
  if (key === "custom" && custom?.from && custom.to) {
    start = startOfDay(new Date(custom.from));
    end = new Date(startOfDay(new Date(custom.to)).getTime() + DAY);
  } else if (key === "today") {
    start = startOfDay(now);
    end = new Date(start.getTime() + DAY);
  } else {
    const days = key === "week" ? 7 : 30;
    end = new Date(startOfDay(now).getTime() + DAY);
    start = new Date(end.getTime() - days * DAY);
  }
  const length = Math.max(DAY, end.getTime() - start.getTime());
  return { current: { start, end }, previous: { start: new Date(start.getTime() - length), end: start } };
}

export function inPeriod(iso: string, p: Period): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= p.start.getTime() && t < p.end.getTime();
}

export function countBy<T>(rows: readonly T[], key: (r: T) => string): Array<{ label: string; value: number }> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function dailyCounts(rows: readonly string[], p: Period): Array<{ label: string; value: number }> {
  const days = Math.min(90, Math.max(1, Math.round((p.end.getTime() - p.start.getTime()) / DAY)));
  const out = Array.from({ length: days }, (_, i) => ({ label: new Date(p.start.getTime() + i * DAY).toISOString().slice(5, 10), value: 0 }));
  for (const iso of rows) {
    const idx = Math.floor((new Date(iso).getTime() - p.start.getTime()) / DAY);
    const slot = out[idx];
    if (slot) slot.value++;
  }
  return out;
}

export function delta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "no change" : "new activity";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs previous period`;
}
