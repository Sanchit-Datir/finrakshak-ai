import { describe, expect, it } from 'vitest';
import { istToday } from './today.js';

describe('istToday', () => {
  it('uses the Indian day, which starts 5 h 30 min before UTC midnight', () => {
    expect(istToday(new Date('2026-10-17T18:29:59.000Z'))).toBe('2026-10-17');
    expect(istToday(new Date('2026-10-17T18:30:00.000Z'))).toBe('2026-10-18');
  });
});
