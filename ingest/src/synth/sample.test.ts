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

  it('stays under 100 KB', () => {
    expect(Buffer.byteLength(buildSample())).toBeLessThan(100_000);
  });

  it('has one loan per customer asked for, each with its expected rules', () => {
    const sample = SampleShape.parse(JSON.parse(buildSample()));
    expect(sample.loans).toHaveLength(Object.values(SAMPLE_ALLOCATION).reduce((s, n) => s + n, 0));
    expect(sample.truth.find((t) => t.archetype === 'fund_diversion')?.expected_rules).toEqual([
      'rapid_onward',
      'linked_counterparty',
    ]);
    expect(
      sample.truth
        .filter((t) => t.archetype === 'control')
        .every((t) => t.expected_rules.length === 0),
    ).toBe(true);
  });
});
