import { describe, expect, it } from 'vitest';
import { createRng } from './rng.js';

const take = (n: number, f: () => number): number[] => Array.from({ length: n }, f);

describe('createRng', () => {
  it('gives the same stream for the same seed and a different one for another seed', () => {
    const a = take(20, () => createRng(42).int(0, 1_000_000));
    expect(new Set(a).size).toBe(1);
    const r1 = createRng(42);
    const r2 = createRng(42);
    expect(take(50, () => r1.int(0, 1_000_000))).toEqual(take(50, () => r2.int(0, 1_000_000)));
    const r3 = createRng(43);
    const r4 = createRng(42);
    expect(take(50, () => r3.int(0, 1_000_000))).not.toEqual(take(50, () => r4.int(0, 1_000_000)));
  });

  it('keeps int inside its inclusive bounds and hits both ends', () => {
    const r = createRng(1);
    const draws = take(2_000, () => r.int(3, 7));
    expect(Math.min(...draws)).toBe(3);
    expect(Math.max(...draws)).toBe(7);
    expect(draws.every(Number.isInteger)).toBe(true);
    expect(createRng(1).int(5, 5)).toBe(5);
  });

  it('rejects bad arguments instead of returning something odd', () => {
    const r = createRng(1);
    expect(() => r.int(2, 1)).toThrow(RangeError);
    expect(() => r.int(0.5, 3)).toThrow(RangeError);
    expect(() => r.int(0, 2 ** 32)).toThrow(RangeError);
    expect(() => createRng(-1)).toThrow(RangeError);
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
    expect(() => r.chance(3, 2)).toThrow(RangeError);
    expect(() => r.chance(1, 0)).toThrow(RangeError);
  });

  it('chance is exact at the ends and roughly fair in the middle', () => {
    const r = createRng(7);
    expect(take(200, () => (r.chance(0, 10) ? 1 : 0)).reduce((s, v) => s + v, 0)).toBe(0);
    expect(take(200, () => (r.chance(10, 10) ? 1 : 0)).reduce((s, v) => s + v, 0)).toBe(200);
    const hits = take(10_000, () => (r.chance(1, 4) ? 1 : 0)).reduce((s, v) => s + v, 0);
    expect(hits).toBeGreaterThan(2_300);
    expect(hits).toBeLessThan(2_700);
  });

  it('amount returns whole multiples of the step inside the range', () => {
    const r = createRng(9);
    for (const v of take(500, () => r.amount(10_000, 99_999, 100))) {
      expect(v % 100).toBe(0);
      expect(v).toBeGreaterThanOrEqual(10_000);
      expect(v).toBeLessThanOrEqual(99_900);
    }
    expect(() => r.amount(101, 199, 100)).toThrow(RangeError);
    expect(() => r.amount(1, 10, 0)).toThrow(RangeError);
  });

  it('shuffles without losing or changing anything, and does not touch the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(3).shuffle(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out).not.toEqual(input);
  });

  it('forks independent, repeatable streams', () => {
    const a1 = createRng(5).fork('slow_burn');
    const a2 = createRng(5).fork('slow_burn');
    const b = createRng(5).fork('control');
    expect(take(20, () => a1.int(0, 1e6))).toEqual(take(20, () => a2.int(0, 1e6)));
    const a3 = createRng(5).fork('slow_burn');
    expect(take(20, () => a3.int(0, 1e6))).not.toEqual(take(20, () => b.int(0, 1e6)));
  });

  it('keeps a fork unchanged when the parent has drawn numbers or another fork exists', () => {
    const quiet = createRng(5).fork('x');
    const parent = createRng(5);
    parent.int(0, 100);
    parent.fork('other').int(0, 100);
    const busy = parent.fork('x');
    expect(take(20, () => busy.int(0, 1e6))).toEqual(take(20, () => quiet.int(0, 1e6)));
  });
});
