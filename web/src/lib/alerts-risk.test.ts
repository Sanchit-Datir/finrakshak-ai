import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import { loadSampleRiskScores } from './cloud/risk-scores.js';
import { SOURCE_LABEL, riskScoreAlerts } from './alerts.js';

describe('riskScoreAlerts (W3d)', () => {
  it('turns synthetic risk alerts into unified alerts that link to the risk scores page', async () => {
    const { alerts } = await loadSampleRiskScores();
    const out = riskScoreAlerts(createDemoDb(), alerts);
    expect(out).toHaveLength(alerts.length);
    for (const a of out) {
      expect(a.source).toBe('risk_score');
      expect(a.id.startsWith('risk:')).toBe(true);
      expect(a.title).toMatch(/\(SYNTH\)$/);
      expect(a.linkedHref).toMatch(/^\/monitoring\/risk-scores\?loan=/);
      expect(a.status).toBe('new');
      expect(`${a.title} ${a.reason}`).not.toMatch(/fraud/i);
    }
    expect(SOURCE_LABEL.risk_score).toBe('Risk score (synthetic)');
  });

  it('keeps a locally changed status', async () => {
    const { alerts } = await loadSampleRiskScores();
    const [first] = alerts;
    if (first === undefined) throw new Error('sample has no alerts');
    const db = createDemoDb();
    db.alertStates[`risk:${first.alert_id}`] = {
      status: 'in_review',
      assignee: null,
      resolutionReason: null,
      notes: [],
      audit: [],
    };
    expect(riskScoreAlerts(db, [first])[0]?.status).toBe('in_review');
  });
});
