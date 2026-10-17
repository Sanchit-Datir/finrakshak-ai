/** The p-th percentile (0–100) by linear interpolation; throws on an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new RangeError('percentile of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (rank - lo);
}

/** Rounds to one decimal, for statistics shown to people. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;
