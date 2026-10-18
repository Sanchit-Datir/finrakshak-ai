import { istDate } from '@finrakshak-ai/shared';

/**
 * Date and time arithmetic for the generator, on strings and integers only (B-27). "A day" is an Indian
 * calendar day; instants are UTC ISO strings. Nothing here reads the clock or the machine's time zone.
 */

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const IST_OFFSET_MS = 330 * 60_000;

export interface Ymd {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function formatDate({ y, m, d }: Ymd): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Parses `YYYY-MM-DD` strictly; a date that does not exist (2025-02-29) throws. */
export function parseDate(date: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const [, ys, ms, ds] = match ?? [];
  if (ys === undefined || ms === undefined || ds === undefined)
    throw new RangeError(`Not a date (YYYY-MM-DD): ${date}`);
  const ymd = { y: Number(ys), m: Number(ms), d: Number(ds) };
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m))
    throw new RangeError(`Not a real date: ${date}`);
  return ymd;
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return formatDate({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** Adds calendar months and clamps the day to the end of the target month (31 Jan + 1 = 28 or 29 Feb). */
export function addMonths(date: string, months: number): string {
  const { y, m, d } = parseDate(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (((index % 12) + 12) % 12) + 1;
  return formatDate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

export const monthOf = (date: string): string => {
  parseDate(date);
  return date.slice(0, 7);
};

export function monthStart(month: string): string {
  const first = `${month}-01`;
  parseDate(first);
  return first;
}

export function monthEnd(month: string): string {
  const { y, m } = parseDate(`${month}-01`);
  return formatDate({ y, m, d: daysInMonth(y, m) });
}

export const addMonthsToMonth = (month: string, n: number): string =>
  monthOf(addMonths(monthStart(month), n));

/** `count` consecutive months starting at `start`. */
export function monthRange(start: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a whole number');
  return Array.from({ length: count }, (_, i) => addMonthsToMonth(start, i));
}

/** The UTC instant of a wall-clock time in India (IST, UTC+05:30, no daylight saving). */
export function istInstant(date: string, hour = 0, minute = 0): string {
  const { y, m, d } = parseDate(date);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError('hour must be 0–23');
  if (!Number.isInteger(minute) || minute < 0 || minute > 59)
    throw new RangeError('minute must be 0–59');
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MS).toISOString();
}

export const shiftInstant = (instant: string, ms: number): string =>
  new Date(Date.parse(instant) + ms).toISOString();

export const istDayOf = (instant: string): string => istDate(instant);
export const istMonthOf = (instant: string): string => istDate(instant).slice(0, 7);

/** True when the IST day of `instant` is on or before the last day of `month`. */
export const onOrBeforeMonthEnd = (instant: string, month: string): boolean =>
  istDate(instant) <= monthEnd(month);

/** Whole months from `from` to `to` (negative when `to` is earlier). */
export function monthsBetween(from: string, to: string): number {
  const a = parseDate(`${from}-01`);
  const b = parseDate(`${to}-01`);
  return (b.y - a.y) * 12 + (b.m - a.m);
}
