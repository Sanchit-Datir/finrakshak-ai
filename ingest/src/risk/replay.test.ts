import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_SETTINGS as S, matchPattern } from '@fund-tracker/shared';
import { writeSmallDataset } from '../test/synthScoring.js';
import { fileScoringInputs } from './fileInputs.js';
import type { ScoringData } from './inputs.js';
import { codePatterns, loadLibrary } from './patternSources.js';
import { monthsFrom, replay, type ReplayResult } from './replay.js';

const dir = writeSmallDataset();
const data = await fileScoringInputs({ dir, seedReviewFile: `${dir}/none.json` }).load();
const library = await loadLibrary(codePatterns());
const MONTHS = monthsFrom('2024-01', 24);
const run = (d: ScoringData = data, lib = library): ReplayResult =>
  replay(d, { months: MONTHS, settings: S, library: lib, matcher: matchPattern });

describe('month-by-month replay', () => {
  const result = run();
  const alerts = result.rows.filter((r) => r.alert.kind !== 'none');

  it('scores each disbursed loan once per month, and is deterministic', () => {
    expect(new Set(result.rows.map((r) => `${r.month}|${r.score.loan_id}`)).size).toBe(
      result.rows.length,
    );
    expect(run()).toEqual(result);
  });

  it('alerts once for each sudden enforcement, as an override, on the month of the record', () => {
    const urgent = data.records.map((r) => r.entity_id).sort();
    expect(alerts.map((r) => r.score.borrower_id).sort()).toEqual(urgent);
    expect(alerts.every((r) => r.alert.kind === 'override' && r.held_band === 'urgent')).toBe(true);
    for (const a of alerts) {
      const rec = data.records.find((r) => r.entity_id === a.score.borrower_id);
      expect(rec?.date?.slice(0, 7)).toBe(a.month);
    }
  });

  it('scores a lone enforcement record as a half match of a two-step sequence with the real matcher', () => {
    const rows = result.rows.filter((r) =>
      r.score.reasons.some((x) => x.pattern?.pattern_name.startsWith('Enforcement record, then')),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const reason = row.score.reasons.find((x) => x.facts['template'] === 'sequence');
      expect(reason).toMatchObject({
        points: 9,
        evidence_statuses: ['allegation'],
        pattern: { strength: 0.5, support_weight: 0.6 },
      });
      expect(reason?.evidence_event_ids).toHaveLength(1);
    }
  });

  it('writes a "what changed" block on every row', () => {
    const first = alerts[0];
    expect(first?.change_text).toContain(
      'New since last check:\n- A public record (ed provisional attachment',
    );
    expect(first?.change_text).toContain('Band: Routine review → Urgent review.');
  });

  it('records no_seed_review while the review file does not exist', () => {
    expect(result.findings.map((f) => f.code)).toContain('no_seed_review');
  });

  it('marks every score stale when the public data is old (B-56)', () => {
    const stale = run({ ...data, dataBuiltOn: '2024-01-01' });
    expect(stale.rows.filter((r) => r.month >= '2024-02').every((r) => r.score.stale_inputs)).toBe(
      true,
    );
    expect(stale.findings.map((f) => f.code)).toContain('stale_public_data');
    for (const r of stale.rows)
      if (r.score.stale_inputs) expect(r.change_text).toContain('is stale');
  });

  it('marks the run no_patterns without a library, never reading it as low risk (B-56)', () => {
    const none = run(data, {
      library: null,
      findings: [{ code: 'library_refused', detail: 'test' }],
    });
    expect(none.rows.every((r) => r.score.no_patterns && r.score.points.pattern === 0)).toBe(true);
    expect(none.rows[0]?.change_text).toContain('its 0 is not low risk');
  });

  it('gives the months of a period', () => {
    expect(monthsFrom('2024-11', 3)).toEqual(['2024-11', '2024-12', '2025-01']);
  });
});
