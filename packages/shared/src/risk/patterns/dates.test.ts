import { describe, expect, it } from 'vitest';
import { addMonthsToDate, approxMonthsBetween, daysBetweenDates } from './dates.js';

describe('addMonthsToDate', () => {
  it('adds calendar months and clamps to the end of a shorter month', () => {
    expect(addMonthsToDate('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsToDate('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsToDate('2024-03-31', 1)).toBe('2024-04-30');
    expect(addMonthsToDate('2023-01-10', 12)).toBe('2024-01-10');
    expect(addMonthsToDate('2024-02-29', 12)).toBe('2025-02-28');
  });
  it('rolls over year ends and goes back', () => {
    expect(addMonthsToDate('2024-11-15', 2)).toBe('2025-01-15');
    expect(addMonthsToDate('2024-01-15', -2)).toBe('2023-11-15');
    expect(addMonthsToDate('2024-03-15', 0)).toBe('2024-03-15');
    expect(addMonthsToDate('2020-06-30', 60)).toBe('2025-06-30');
  });
  it('rejects text that is not a real date', () => {
    for (const bad of [
      '2025-02-29',
      '2024-13-01',
      '2024-00-01',
      '2024-1-1',
      '',
      '2024-01-01T00:00:00Z',
    ])
      expect(() => addMonthsToDate(bad, 1), bad).toThrow(RangeError);
  });
  it('keeps order: a later date plus the same months is never earlier (so the lead check can use the latest step)', () => {
    const days: string[] = [];
    for (let t = Date.UTC(2023, 11, 20); t <= Date.UTC(2024, 3, 10); t += 86_400_000)
      days.push(new Date(t).toISOString().slice(0, 10));
    for (const months of [1, 12, 13])
      for (let i = 1; i < days.length; i++)
        expect(
          addMonthsToDate(days[i] ?? '', months) >= addMonthsToDate(days[i - 1] ?? '', months),
          `${days[i]} + ${months}`,
        ).toBe(true);
  });
});

describe('daysBetweenDates and approxMonthsBetween', () => {
  it('counts days across a leap day, both ways', () => {
    expect(daysBetweenDates('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetweenDates('2025-02-28', '2025-03-01')).toBe(1);
    expect(daysBetweenDates('2024-03-01', '2024-02-28')).toBe(-2);
    expect(daysBetweenDates('2024-05-05', '2024-05-05')).toBe(0);
  });
  it('gives months with one decimal', () => {
    expect(approxMonthsBetween('2023-01-10', '2023-09-15')).toBe(8.1);
    expect(approxMonthsBetween('2023-01-01', '2023-01-01')).toBe(0);
    expect(approxMonthsBetween('2023-01-01', '2024-01-01')).toBe(12);
  });
});
