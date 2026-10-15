import { describe, expect, it } from 'vitest';
import { addMoney } from './money.js';

describe('addMoney', () => {
  it('adds same-currency amounts', () => {
    expect(addMoney({ minor: 150, currency: 'INR' }, { minor: 50, currency: 'INR' })).toEqual({
      minor: 200,
      currency: 'INR',
    });
  });
  it('rejects currency mismatch', () => {
    expect(() => addMoney({ minor: 1, currency: 'INR' }, { minor: 1, currency: 'USD' })).toThrow(
      RangeError,
    );
  });
  it('rejects overflow', () => {
    expect(() =>
      addMoney({ minor: Number.MAX_SAFE_INTEGER, currency: 'INR' }, { minor: 1, currency: 'INR' }),
    ).toThrow(RangeError);
  });
});
