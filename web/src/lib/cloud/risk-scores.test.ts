import { describe, expect, it } from 'vitest';
import sample from '../../demo/synth-risk-sample.json';
import { loadSampleRiskScores, parseRiskScores } from './risk-scores.js';

describe('parseRiskScores', () => {
  it('parses the bundled sample of SYNTH scores with the shared schemas', async () => {
    const s = await loadSampleRiskScores();
    expect(s.origin).toBe('sample');
    expect(s.dropped).toBe(0);
    expect(s.scores.length).toBe(sample.scores.length);
    expect(s.scores.every((x) => x.latest.loan_id === x.loan_id)).toBe(true);
    expect(new Set(s.scores.map((x) => x.synthetic))).toEqual(new Set([true]));
    expect(s.alerts.length).toBeGreaterThan(0);
  });

  it('drops and counts malformed items instead of trusting them', () => {
    const [first] = sample.scores;
    const out = parseRiskScores(
      { scores: [first, { loan_id: 'x' }], alerts: ['junk'], truncated: true },
      'cloud',
    );
    expect(out.scores).toHaveLength(1);
    expect(out.dropped).toBe(2);
    expect(out.truncated).toBe(true);
  });

  it('rejects a response that is not a result at all', () => {
    expect(() => parseRiskScores({ scores: 'no' }, 'cloud')).toThrow();
    expect(() => parseRiskScores(null, 'cloud')).toThrow();
  });
});
