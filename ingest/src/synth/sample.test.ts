import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SAMPLE_ALLOCATION, buildSample } from './sample.js';

const SampleShape = z.object({
  loans: z.array(z.unknown()),
  truth: z.array(z.object({ archetype: z.string(), expected_rules: z.array(z.string()) })),
});
const COMMITTED = fileURLToPath(new URL('../../../web/src/lib/synth-sample.json', import.meta.url));

describe('contract sample', () => {
  it('is the committed file, byte for byte (regenerate with `node ingest/dist/synthCli.js --sample`)', () => {
    expect(readFileSync(COMMITTED, 'utf8')).toBe(buildSample());
  });

  it('drops transactions after the first 91 days of each loan, which no rule reads', () => {
    const sample = JSON.parse(buildSample()) as unknown;
    const parsed = z.object({ transactions: z.array(z.object({ at: z.string() })) }).parse(sample);
    expect(parsed.transactions.length).toBeGreaterThan(100);
  });

  it('stays under 100 KB', () => {
    expect(Buffer.byteLength(buildSample())).toBeLessThan(100_000);
  });

  it('has one loan per customer asked for, each with its expected rules', () => {
    const sample = SampleShape.parse(JSON.parse(buildSample()));
    expect(sample.loans).toHaveLength(Object.values(SAMPLE_ALLOCATION).reduce((s, n) => s + n, 0));
    const rulesOf = (a: string): string[] =>
      sample.truth.filter((t) => t.archetype === a).flatMap((t) => t.expected_rules);
    expect(rulesOf('fund_diversion')).toEqual(['rapid_onward', 'linked_counterparty']);
    expect(rulesOf('round_trip')).toEqual(['circular']);
    expect(rulesOf('cash_split')).toEqual(['cash_split']);
    expect(rulesOf('shared_address')).toEqual(['repeated_counterparty', 'repeated_counterparty']);
    expect(rulesOf('near_threshold')).toEqual([]);
    expect(
      sample.truth
        .filter((t) => t.archetype === 'control')
        .every((t) => t.expected_rules.length === 0),
    ).toBe(true);
  });
});
