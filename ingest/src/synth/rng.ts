/**
 * Seeded random numbers for the synthetic data generator. No dependency, no `Math.random`, no clock:
 * one seed always gives the same stream (B-24). Every public draw is an integer, so amounts are never
 * floats (B-01). Floats exist only inside `next()`.
 */

export interface Rng {
  /** An integer in [min, max], both included. The range may hold at most 2^32 values. */
  int(min: number, max: number): number;
  /** True with probability numerator / denominator, decided with integers. */
  chance(numerator: number, denominator: number): boolean;
  /** One element; throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher–Yates); the input is not changed. */
  shuffle<T>(items: readonly T[]): T[];
  /** A whole-unit amount: a multiple of `step` in [min, max]. */
  amount(min: number, max: number, step?: number): number;
  /** An independent stream named by `label`; creating one never changes the others. */
  fork(label: string): Rng;
}

const TWO_32 = 4_294_967_296;

/** FNV-1a, 32 bit: a small stable string hash for deriving stream seeds. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function assertInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

/** mulberry32: a 32-bit generator with a one-number state. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_32;
  };
}

export function createRng(seed: number, path = ''): Rng {
  assertInt('seed', seed);
  if (seed < 0) throw new RangeError('seed must not be negative');
  const next = mulberry32(hashString(`${seed}:${path}`));

  const int = (min: number, max: number): number => {
    assertInt('min', min);
    assertInt('max', max);
    if (min > max) throw new RangeError(`min ${min} is above max ${max}`);
    const span = max - min + 1;
    if (span > TWO_32) throw new RangeError('range holds more than 2^32 values; use a larger step');
    return min + Math.floor(next() * span);
  };

  return {
    int,
    chance: (numerator, denominator) => {
      assertInt('numerator', numerator);
      assertInt('denominator', denominator);
      if (denominator <= 0 || numerator < 0 || numerator > denominator)
        throw new RangeError('chance needs 0 <= numerator <= denominator and denominator > 0');
      return int(1, denominator) <= numerator;
    },
    pick: <T>(items: readonly T[]): T => {
      const item = items[int(0, items.length - 1)];
      if (items.length === 0 || item === undefined)
        throw new RangeError('pick needs a non-empty list');
      return item;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const a = out[i];
        const b = out[j];
        if (a !== undefined && b !== undefined) {
          out[i] = b;
          out[j] = a;
        }
      }
      return out;
    },
    amount: (min, max, step = 1) => {
      assertInt('step', step);
      if (step <= 0) throw new RangeError('step must be positive');
      const lo = Math.ceil(min / step);
      const hi = Math.floor(max / step);
      if (lo > hi) throw new RangeError(`no multiple of ${step} between ${min} and ${max}`);
      return int(lo, hi) * step;
    },
    fork: (label) => createRng(seed, `${path}/${label}`),
  };
}
