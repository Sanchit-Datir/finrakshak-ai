import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { InputSchema } from '../callable/assistRecord.js';
import { buildPrompt, ground, mockAssist } from './assist.js';

/** The same cases the shared grounding check runs, so the runtime copy cannot drift (B-66). */
const Cases = z.object({
  input: z.unknown(),
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
  JSON.parse(
    readFileSync(
      new URL('../../../packages/shared/src/assist-grounding-cases.json', import.meta.url),
      'utf8',
    ),
  ),
);
const input = InputSchema.parse(golden.input);

describe('ground (runtime copy of the shared check)', () => {
  for (const c of golden.cases) {
    it(c.name, () => {
      const out = ground(input, { headline: '', statements: [c.statement], followUps: [] });
      expect(out.statements.length === 1).toBe(c.kept);
      if (c.reason !== null) expect(out.check[c.reason]).toBe(1);
    });
  }
  for (const h of golden.headlines) {
    it(`headline "${h.headline}"`, () => {
      const out = ground(input, { headline: h.headline, statements: [], followUps: [] });
      expect(out.headline === h.headline).toBe(h.kept);
    });
  }
});

describe('buildPrompt', () => {
  it('delimits the record and keeps the facts as data', () => {
    const p = buildPrompt(input);
    expect(p).toContain('<<<RECORD');
    expect(p).toContain('RECORD>>>');
    expect(p).toContain('"ref":"A1"');
    expect(p).not.toContain('<<<QUESTION');
  });
});

describe('mockAssist', () => {
  it('quotes facts, cites them and passes its own check', () => {
    const out = mockAssist(input);
    expect(out.statements.length).toBe(3);
    expect(out.check.kept).toBe(3);
    expect(out.statements.every((s) => s.text.startsWith('[mock]'))).toBe(true);
  });
});
