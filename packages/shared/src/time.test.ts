import { describe, expect, it } from 'vitest';
import { istDate } from './time.js';

describe('istDate (B-27: a day is an Indian calendar day)', () => {
  it('moves to the next IST day at 18:30 UTC', () => {
    expect(istDate('2026-10-17T18:29:59.999Z')).toBe('2026-10-17');
    expect(istDate('2026-10-17T18:30:00.000Z')).toBe('2026-10-18');
  });
  it('handles month and year ends and Date input', () => {
    expect(istDate('2026-12-31T19:00:00Z')).toBe('2027-01-01');
    expect(istDate(new Date('2026-02-28T20:00:00Z'))).toBe('2026-03-01');
  });
  it('rejects unparseable timestamps', () => {
    expect(() => istDate('not a date')).toThrow(/Not a timestamp/);
  });
});
