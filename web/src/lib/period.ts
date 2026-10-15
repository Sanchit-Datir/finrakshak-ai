/** Reporting/dashboard period selection. All boundaries are computed in the browser's local time. */

export type PeriodKind = 'today' | '7d' | '30d' | 'month' | 'last_month' | 'custom';

export interface PeriodValue {
  kind: PeriodKind;
  from: string; // yyyy-mm-dd, used when kind === 'custom'
  to: string;
}

export interface Range {
  start: Date;
  end: Date;
  label: string;
}

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  last_month: 'Last month',
  custom: 'Custom range',
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toInput(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function defaultPeriod(kind: PeriodKind = '30d', now: Date = new Date()): PeriodValue {
  return { kind, from: toInput(new Date(now.getTime() - 29 * 86_400_000)), to: toInput(now) };
}

export function resolvePeriod(p: PeriodValue, now: Date = new Date()): Range {
  const today = startOfDay(now);
  const endOfToday = new Date(today.getTime() + 86_400_000 - 1);
  switch (p.kind) {
    case 'today':
      return { start: today, end: endOfToday, label: 'Today' };
    case '7d':
      return { start: new Date(today.getTime() - 6 * 86_400_000), end: endOfToday, label: 'Last 7 days' };
    case '30d':
      return { start: new Date(today.getTime() - 29 * 86_400_000), end: endOfToday, label: 'Last 30 days' };
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfToday, label: 'This month' };
    case 'last_month':
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, -1), label: 'Last month' };
    case 'custom': {
      const s = new Date(`${p.from}T00:00:00`);
      const e = new Date(`${p.to}T23:59:59.999`);
      const valid = !Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s <= e;
      return valid ? { start: s, end: e, label: `${p.from} to ${p.to}` } : { start: today, end: endOfToday, label: 'Invalid range — showing today' };
    }
  }
}

export function inRange(iso: string | null, r: Range): boolean {
  if (iso === null) return false;
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t <= r.end.getTime();
}

export interface BucketDef {
  label: string;
  start: number;
  end: number;
}

/** Day buckets for ranges up to 31 days, week buckets beyond. */
export function buckets(r: Range): BucketDef[] {
  const days = Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000));
  const size = days <= 31 ? 1 : 7;
  const out: BucketDef[] = [];
  const fmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
  for (let t = r.start.getTime(); t <= r.end.getTime(); t += size * 86_400_000) {
    out.push({ label: fmt.format(new Date(t)), start: t, end: Math.min(t + size * 86_400_000 - 1, r.end.getTime()) });
  }
  return out;
}
