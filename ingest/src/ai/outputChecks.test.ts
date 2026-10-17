import { describe, expect, it } from 'vitest';
import { numbersIn, numbersOf, unknownNumbers } from './outputChecks.js';

describe('numbersIn / unknownNumbers (the model never counts)', () => {
  it('reads integers, decimals, thousands and dates', () => {
    expect(numbersIn('4 cases, lift 1.35, 1,200 entities, on 2026-10-06.')).toEqual([
      4, 1.35, 1200, 2026, 10, 6,
    ]);
    expect(numbersIn('no numbers here.')).toEqual([]);
  });

  it('accepts repeated code numbers and reports invented ones once', () => {
    const allowed = numbersOf({ support: 4, lift: 1.35, date: '2026-10-06' });
    expect(unknownNumbers('Seen in 4 cases (lift 1.35) on 6 Oct 2026.', allowed)).toEqual([]);
    expect(unknownNumbers('Seen in 5 cases, 5 of them large, 80% of all.', allowed)).toEqual([
      5, 80,
    ]);
  });
});
