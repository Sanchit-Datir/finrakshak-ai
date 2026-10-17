/**
 * "A day" in this product is an Indian calendar day (owner's decision, B-27). Instants are stored
 * as UTC ISO-8601; only day boundaries use India Standard Time (UTC+05:30, no daylight saving).
 */
export const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The IST calendar date (YYYY-MM-DD) of a UTC instant; throws on an unparseable timestamp. */
export function istDate(instant: string | Date): string {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  if (Number.isNaN(ms)) throw new Error(`Not a timestamp: ${String(instant)}`);
  // A fixed offset is exact for IST (no DST), and avoids depending on the runtime's ICU data.
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}
