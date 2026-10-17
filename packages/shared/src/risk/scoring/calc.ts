/**
 * Small exact helpers for the scoring layers: calendar arithmetic on IST dates (YYYY-MM-DD, B-27) and
 * rounding. Dates are compared as strings; arithmetic goes through UTC so no time zone is involved.
 */

const DAY_MS = 86_400_000;

const parts = (date: string): [number, number, number] => {
  const [y = NaN, m = NaN, d = NaN] = date.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))
    throw new RangeError(`Not a date: ${date}`);
  return [y, m, d];
};

const format = (t: Date): string => t.toISOString().slice(0, 10);

export const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Adds calendar months and clamps the day to the end of the target month (31 Jan + 1 = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = index - ny * 12 + 1;
  return format(new Date(Date.UTC(ny, nm - 1, Math.min(d, daysInMonth(ny, nm)))));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** The last day of a `YYYY-MM` month. */
export function monthEnd(month: string): string {
  const [y, m] = parts(`${month}-01`);
  return `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

/**
 * Rounds half up (B-05). The value is first cut to 9 decimals so float noise such as 4.4999999999
 * from 30 × 0.25 × 0.6 rounds as the 4.5 it means.
 */
export const roundHalfUp = (x: number): number => Math.floor(Number(x.toFixed(9)) + 0.5);

/** `percent`% of an integer number of points, rounded half up. */
export const pointsShare = (pts: number, percent: number): number =>
  roundHalfUp((pts * percent) / 100);
