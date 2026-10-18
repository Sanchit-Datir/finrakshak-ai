/** Formatting helpers. Pure functions — UI binds preferences via `useFormat`. */

export type DateFormat = 'dd-mmm-yyyy' | 'dd/mm/yyyy' | 'yyyy-mm-dd';
export interface DateOptions {
  dateFormat: DateFormat;
  timezone: string;
}
export const DEFAULT_DATE_OPTIONS: DateOptions = {
  dateFormat: 'dd-mmm-yyyy',
  timezone: 'Asia/Kolkata',
};

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Formats integer paise as rupees with Indian digit grouping. */
export function formatMoney(minor: number | null): string {
  if (minor === null) return '—';
  return inr.format(minor / 100);
}

/** Compact lakh/crore form for charts and KPI subtitles. */
export function formatMoneyCompact(minor: number): string {
  const rupees = minor / 100;
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  return inr.format(rupees);
}

/** Parses a rupee string ("1,50,000.50") into integer paise, or null if invalid. */
export function parseRupeesToMinor(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function minorToRupeeInput(minor: number | null): string {
  if (minor === null) return '';
  return (minor / 100).toString();
}

function parts(iso: string, tz: string): Record<string, string> {
  const d = new Date(iso);
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)) {
    out[p.type] = p.value;
  }
  const monthNum = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: '2-digit' }).format(d);
  out['monthNum'] = monthNum;
  return out;
}

export function formatDate(iso: string | null, opts: DateOptions = DEFAULT_DATE_OPTIONS): string {
  if (iso === null || iso === '') return '—';
  if (Number.isNaN(new Date(iso).getTime())) return iso;
  const p = parts(iso, opts.timezone);
  const day = p['day'] ?? '';
  const year = p['year'] ?? '';
  switch (opts.dateFormat) {
    case 'dd-mmm-yyyy':
      return `${day} ${p['month'] ?? ''} ${year}`;
    case 'dd/mm/yyyy':
      return `${day}/${p['monthNum'] ?? ''}/${year}`;
    case 'yyyy-mm-dd':
      return `${year}-${p['monthNum'] ?? ''}-${day}`;
  }
}

export function formatDateTime(
  iso: string | null,
  opts: DateOptions = DEFAULT_DATE_OPTIONS,
): string {
  if (iso === null || iso === '') return '—';
  if (Number.isNaN(new Date(iso).getTime())) return iso;
  const p = parts(iso, opts.timezone);
  return `${formatDate(iso, opts)}, ${p['hour'] ?? ''}:${p['minute'] ?? ''}`;
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Masks all but the last 4 digits. Used for Aadhaar and account numbers (spec §18). */
export function maskIdentifier(value: string, visible = 4): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= visible) return 'XXXX';
  const tail = digits.slice(-visible);
  return `XXXX XXXX ${tail}`;
}

export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function greeting(date: Date = new Date(), timezone = 'Asia/Kolkata'): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(
      date,
    ),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
