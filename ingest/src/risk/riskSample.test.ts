import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RiskAlertDocSchema, RiskScoreViewSchema } from '@fund-tracker/shared';
import { buildRiskSample, RISK_SAMPLE_PATH } from './riskSample.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('the bundled risk score sample', () => {
  it('matches what the scoring core produces (rebuild: node ingest/dist/risk/riskSampleCli.js)', async () => {
    const committed: unknown = JSON.parse(
      readFileSync(path.join(repoRoot, RISK_SAMPLE_PATH), 'utf8'),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(await buildRiskSample())));
  });

  it('holds valid, synthetic scores and alerts with every band represented', async () => {
    const s = await buildRiskSample();
    const scores = s.scores.map((x) => RiskScoreViewSchema.parse(x));
    s.alerts.forEach((a) => RiskAlertDocSchema.parse(a));
    expect(new Set(scores.map((x) => x.held_band)).size).toBeGreaterThan(1);
    expect(s.alerts.length).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toMatch(/fraud/i);
  });
});
