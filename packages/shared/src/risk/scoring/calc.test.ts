import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, monthEnd, pointsShare, roundHalfUp } from './calc.js';

describe('calendar helpers', () => {
  it('add months and clamp to the month end', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-11-15', 3)).toBe('2025-02-15');
    expect(addMonths('2024-03-10', -3)).toBe('2023-12-10');
  });

  it('count whole days', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2024-03-01', '2024-02-28')).toBe(-2);
    expect(daysBetween('2024-05-05', '2024-05-05')).toBe(0);
  });

  it('give the last day of a month', () => {
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2025-12')).toBe('2025-12-31');
  });

  it('reject a non-date', () => {
    expect(() => daysBetween('soon', '2024-01-01')).toThrow(RangeError);
  });
});

describe('rounding (B-05)', () => {
  it('rounds half up, through float noise', () => {
    expect(roundHalfUp(30 * 0.25 * 0.6)).toBe(5);
    expect(roundHalfUp(4.4999999999999)).toBe(5);
    expect(roundHalfUp(4.4999)).toBe(4);
    expect(roundHalfUp(30 * 0.85 * 0.6)).toBe(15);
    expect(roundHalfUp(4.49)).toBe(4);
    expect(roundHalfUp(17.5)).toBe(18);
  });

  it('takes a percent share of points', () => {
    expect(pointsShare(25, 50)).toBe(13);
    expect(pointsShare(40, 50)).toBe(20);
    expect(pointsShare(15, 0)).toBe(0);
  });
});
