import { describe, expect, it } from 'vitest';
import sample from '../../demo/synth-risk-sample.json';
import { latestExplained, loadSampleRiskScores, parseRiskScores } from './risk-scores.js';

describe('parseRiskScores', () => {
  it('parses the bundled sample of SYNTH scores with the shared schemas', async () => {
    const s = await loadSampleRiskScores();
    expect(s.origin).toBe('sample');
    expect(s.dropped).toBe(0);
    expect(s.scores.length).toBe(sample.scores.length);
    expect(s.scores.every((x) => x.latest.loan_id === x.loan_id)).toBe(true);
    expect(new Set(s.scores.map((x) => x.synthetic))).toEqual(new Set([true]));
    expect(s.alerts.length).toBeGreaterThan(0);
    // The bundled sample is code output: it never carries AI sentences.
    expect(s.explanations).toEqual([]);
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

  it('parses explanations and shows one only for the loan’s latest alert', async () => {
    const s = await loadSampleRiskScores();
    const loanId = s.alerts[0]?.loan_id ?? '';
    const alerts = s.alerts.filter((a) => a.loan_id === loanId);
    const latest = alerts.reduce((a, b) => (b.created_at > a.created_at ? b : a));
    const explanation = (alertId: string): Record<string, unknown> => ({
      alert_id: alertId,
      loan_id: loanId,
      branch_id: latest.branch_id,
      run_id: latest.run_id,
      text: 'A public record names the borrower (an allegation, not a finding).',
      model: 'gemini-test',
      prompt_version: 'explain.v1',
      created_at: '2025-09-30T22:00:00.000Z',
      synthetic: true,
    });
    const out = parseRiskScores(
      {
        ...sample,
        explanations: [explanation(latest.alert_id), { alert_id: 'x', text: 'fraud' }],
      },
      'cloud',
    );
    expect(out.explanations).toHaveLength(1);
    expect(out.dropped).toBe(1);
    expect(latestExplained(out, loanId)?.alert.alert_id).toBe(latest.alert_id);
    const older = alerts.find((a) => a.alert_id !== latest.alert_id);
    if (older !== undefined) {
      const stale = parseRiskScores({ ...sample, explanations: [explanation(older.alert_id)] }, 'cloud');
      expect(latestExplained(stale, loanId)).toBeNull();
    }
    expect(latestExplained(out, 'L-none')).toBeNull();
  });

  it('rejects a response that is not a result at all', () => {
    expect(() => parseRiskScores({ scores: 'no' }, 'cloud')).toThrow();
    expect(() => parseRiskScores(null, 'cloud')).toThrow();
  });
});
