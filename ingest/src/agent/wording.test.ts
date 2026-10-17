import { describe, expect, it } from 'vitest';
import { violatesWording } from './wording.js';

describe('violatesWording (leads, never verdicts)', () => {
  it('flags verdict words in any form', () => {
    for (const t of [
      'committed fraud',
      'Fraudulent entries',
      'found GUILTY',
      'a scam',
      'criminal case',
      'was convicted',
      'money laundering',
    ])
      expect(violatesWording(t)).toBe(true);
  });
  it('allows neutral descriptions', () => {
    expect(violatesWording('ED attached assets; an allegation under investigation')).toBe(false);
    expect(violatesWording('Routine review: IBBI insolvency announcement')).toBe(false);
  });
});
