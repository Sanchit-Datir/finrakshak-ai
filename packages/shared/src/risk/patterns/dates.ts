/**
 * Date arithmetic for the pattern matcher, on `YYYY-MM-DD` strings and integers only (B-27): no clock,
 * no time zone. Months are calendar months; a day that does not exist in the target month is clamped to
 * the month's last day (31 Jan + 1 month = 28 or 29 Feb), so "within 12 months" is exact at the edge.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): { y: number; m: number; d: number } {
  const match = DATE.exec(date);
  const [, ys, ms, ds] = match ?? [];
  if (ys === undefined || ms === undefined || ds === undefined)
    throw new RangeError(`Not a date (YYYY-MM-DD): ${date}`);
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate())
    throw new RangeError(`Not a real date: ${date}`);
  return { y, m, d };
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** `date` plus `months` calendar months (negative goes back), clamped to the end of a shorter month. */
export function addMonthsToDate(date: string, months: number): string {
  const { y, m, d } = parts(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (((index % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${pad(ny, 4)}-${pad(nm, 2)}-${pad(Math.min(d, last), 2)}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenDates(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Months from `from` to `to` as a number with one decimal (30.4375 days to a month), for statistics only. */
export function approxMonthsBetween(from: string, to: string): number {
  return Math.round((daysBetweenDates(from, to) / 30.4375) * 10) / 10;
}
