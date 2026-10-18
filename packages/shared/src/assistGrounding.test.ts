import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AssistInputSchema } from './assist.js';
import { groundAssist, numbersIn } from './assistGrounding.js';

const Cases = z.object({
  input: AssistInputSchema,
  cases: z.array(
    z.object({
      name: z.string(),
      statement: z.object({ text: z.string(), refs: z.array(z.string()) }),
      kept: z.boolean(),
      reason: z.enum(['droppedUncited', 'droppedNumbers', 'droppedWording']).nullable(),
    }),
  ),
  headlines: z.array(z.object({ headline: z.string(), kept: z.boolean() })),
});
const golden = Cases.parse(
  JSON.parse(readFileSync(new URL('./assist-grounding-cases.json', import.meta.url), 'utf8')),
);

describe('groundAssist (B-66)', () => {
  for (const c of golden.cases) {
    it(c.name, () => {
      const out = groundAssist(
        golden.input,
        { headline: '', statements: [c.statement], followUps: [] },
        'Fallback',
      );
      expect(out.statements.length === 1).toBe(c.kept);
      if (c.reason !== null) expect(out.check[c.reason]).toBe(1);
      expect(out.check.received).toBe(1);
    });
  }

  for (const h of golden.headlines) {
    it(`headline "${h.headline}" is ${h.kept ? 'kept' : 'replaced'}`, () => {
      const out = groundAssist(
        golden.input,
        { headline: h.headline, statements: [], followUps: [] },
        'Fallback',
      );
      expect(out.headline === h.headline).toBe(h.kept);
    });
  }

  it('removes citation handles from the text it keeps', () => {
    const out = groundAssist(
      golden.input,
      {
        headline: '',
        statements: [{ text: 'Cash was withdrawn [T1].', refs: ['T1'] }],
        followUps: [],
      },
      'Fallback',
    );
    expect(out.statements[0]?.text).toBe('Cash was withdrawn.');
  });

  it('caps statements and follow-ups and drops follow-ups with verdict words', () => {
    const many = Array.from({ length: 20 }, () => ({
      text: 'A withdrawal was made.',
      refs: ['T1'],
    }));
    const out = groundAssist(
      golden.input,
      { headline: 'x', statements: many, followUps: ['Is it fraud?', 'a', 'b', 'c', 'd'] },
      'Fallback',
    );
    expect(out.statements).toHaveLength(8);
    expect(out.followUps).toEqual(['a', 'b', 'c']);
  });

  it('reads Indian-grouped amounts, percentages and dates as plain numbers', () => {
    expect(numbersIn('₹1,00,000 and 95% on 01 Jun 2023, 2.50')).toEqual([
      '100000',
      '95',
      '1',
      '2023',
      '2.50',
    ]);
  });
});
