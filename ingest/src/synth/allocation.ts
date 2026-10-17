import { SYNTH_ARCHETYPES, type SynthArchetype } from '@fund-tracker/shared';

/** The 200 customers of the plan (docs/plans/SYNTHETIC_TRANSACTIONS_PLAN.md), by scenario. */
export const PLAN_ALLOCATION: Readonly<Record<SynthArchetype, number>> = {
  control: 45,
  slow_burn: 20,
  sudden_enforcement: 15,
  round_trip: 15,
  fund_diversion: 15,
  contagion: 15,
  shared_address: 15,
  cash_split: 10,
  dormant_burst: 10,
  seasonal: 15,
  big_prepayment: 15,
  near_threshold: 10,
};

/**
 * Scales an allocation to exactly `total` customers with the largest-remainder method, using integers
 * only. Ties go to the earlier scenario, so the result never depends on anything but the numbers.
 */
export function scaleAllocation(
  total: number,
  weights: Readonly<Record<SynthArchetype, number>> = PLAN_ALLOCATION,
): Record<SynthArchetype, number> {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new RangeError('total must be a whole number');
  const sum = SYNTH_ARCHETYPES.reduce((s, id) => s + weights[id], 0);
  const out = {} as Record<SynthArchetype, number>;
  const remainders: { id: SynthArchetype; rem: number }[] = [];
  let given = 0;
  for (const id of SYNTH_ARCHETYPES) {
    const quota = total * weights[id];
    out[id] = Math.floor(quota / sum);
    given += out[id];
    remainders.push({ id, rem: quota % sum });
  }
  const order = remainders.map((r, i) => ({ ...r, i })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { id } of order.slice(0, total - given)) out[id] += 1;
  return out;
}
