import { describe, expect, it } from 'vitest';
import {
  DAY,
  HOUR,
  addDays,
  addMonths,
  addMonthsToMonth,
  daysInMonth,
  istDayOf,
  istInstant,
  istMonthOf,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  onOrBeforeMonthEnd,
  parseDate,
  shiftInstant,
} from './calendar.js';

describe('dates', () => {
  it('knows leap years, including the century rules', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2024, 12)).toBe(31);
  });

  it('rejects text that is not a real date', () => {
    for (const bad of [
      '2025-02-29',
      '2024-13-01',
      '2024-00-10',
      '2024-04-31',
      '2024-1-1',
      '',
      '2024-01-01T00:00:00Z',
    ])
      expect(() => parseDate(bad), bad).toThrow(RangeError);
    expect(parseDate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
  });

  it('adds days across month, year and leap-day boundaries, forwards and back', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
    expect(addDays('2024-03-15', 0)).toBe('2024-03-15');
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01');
  });

  it('adds months and clamps to the end of a shorter month', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-03-31', 1)).toBe('2024-04-30');
    expect(addMonths('2024-11-15', 2)).toBe('2025-01-15');
    expect(addMonths('2024-01-15', -2)).toBe('2023-11-15');
    expect(addMonths('2024-01-15', 24)).toBe('2026-01-15');
    expect(addMonths('2024-12-31', 12)).toBe('2025-12-31');
  });
});

describe('months', () => {
  it('gives start, end and neighbours', () => {
    expect(monthOf('2024-02-17')).toBe('2024-02');
    expect(monthStart('2024-02')).toBe('2024-02-01');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2025-02')).toBe('2025-02-28');
    expect(addMonthsToMonth('2024-12', 1)).toBe('2025-01');
    expect(addMonthsToMonth('2024-01', -1)).toBe('2023-12');
    expect(() => monthStart('2024-13')).toThrow(RangeError);
  });

  it('builds a run of consecutive months', () => {
    const months = monthRange('2024-01', 24);
    expect(months).toHaveLength(24);
    expect(months[0]).toBe('2024-01');
    expect(months[11]).toBe('2024-12');
    expect(months[23]).toBe('2025-12');
    expect(monthRange('2024-01', 0)).toEqual([]);
    expect(() => monthRange('2024-01', -1)).toThrow(RangeError);
  });
});

describe('India time (B-27)', () => {
  it('turns an IST wall time into the UTC instant 5 h 30 min earlier', () => {
    expect(istInstant('2024-01-01')).toBe('2023-12-31T18:30:00.000Z');
    expect(istInstant('2024-01-01', 12, 30)).toBe('2024-01-01T07:00:00.000Z');
    expect(istInstant('2024-03-01', 0, 0)).toBe('2024-02-29T18:30:00.000Z');
    expect(() => istInstant('2024-01-01', 24)).toThrow(RangeError);
    expect(() => istInstant('2024-01-01', 0, 60)).toThrow(RangeError);
  });

  it('reads the IST day back from the instant, also when UTC is still the day before', () => {
    expect(istDayOf('2023-12-31T18:30:00.000Z')).toBe('2024-01-01');
    expect(istDayOf('2023-12-31T18:29:59.999Z')).toBe('2023-12-31');
    expect(istDayOf(istInstant('2024-06-15', 3, 10))).toBe('2024-06-15');
    expect(istMonthOf('2024-01-31T20:00:00.000Z')).toBe('2024-02');
  });

  it('keeps a 72-hour window exact across midnight', () => {
    const start = istInstant('2024-01-01', 23, 0);
    const end = shiftInstant(start, 72 * HOUR);
    expect(istDayOf(end)).toBe('2024-01-04');
    expect(Date.parse(end) - Date.parse(start)).toBe(3 * DAY);
  });

  it('decides on or before month end by the IST day', () => {
    expect(onOrBeforeMonthEnd(istInstant('2024-02-29', 23, 59), '2024-02')).toBe(true);
    expect(onOrBeforeMonthEnd(istInstant('2024-03-01', 0, 0), '2024-02')).toBe(false);
    // 2024-02-29 20:00 UTC is already 1 March in India.
    expect(onOrBeforeMonthEnd('2024-02-29T20:00:00.000Z', '2024-02')).toBe(false);
  });
});
