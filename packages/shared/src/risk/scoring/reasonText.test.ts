import { describe, expect, it } from 'vitest';
import { violatesWording } from '../wording.js';
import { changeBlock, formatChangeBlock, reasonText } from './reasonText.js';
import { REASON_CODES, RISK_BAND_LABELS, type Reason, type ReasonCode } from './types.js';

const FACTS: Readonly<Record<ReasonCode, Reason['facts']>> = {
  public_record_after_disbursement: {
    date: '2024-06-01',
    case_type: 'ed_provisional_attachment',
    row: 'after',
  },
  public_record_before_disbursement: { date: '2023-06-01', case_type: 'ibbi_cirp', row: 'before' },
  nfra_finding: { date: '2024-01-01', case_type: 'nfra_order', row: 'nfra' },
  several_proceedings: { count: 2, sources: 1 },
  many_sources: { count: 3, sources: 3 },
  related_party_record: { date: '2024-06-01', case_type: 'ed_arrest', row: 'after' },
  graph_proximity: { hops: 1, link_status: 'verified', kinds: 'insolvency' },
  pattern_match: { template: 'transaction_typology', rule_id: 'rapid_onward' },
  missed_emi: { count: 2, max_days_late: 0, latest_due: '2024-07-10' },
  late_emi: { count: 1, max_days_late: 12, latest_due: '2024-07-10' },
  partial_emi: { count: 1, max_days_late: 0, latest_due: '2024-07-10' },
  growing_delay: { count: 3, days: '3,7,12' },
  receipts_fall: { percent: 40 },
};

const reason = (code: ReasonCode, key = `${code}|x`, points = 4): Reason => ({
  code,
  layer: 'behaviour',
  reason_key: key,
  subject_id: 'B-1',
  points,
  evidence_event_ids: ['e1'],
  evidence_statuses: ['allegation'],
  source: 'ed',
  facts: FACTS[code],
  pattern:
    code === 'pattern_match'
      ? {
          pattern_id: 'pat_d3ad024e84b8df7b',
          pattern_name: 'Most of the loan moved on within hours',
          strength: 1,
          support_weight: 0.6,
        }
      : null,
});

describe('reason text (B-58: a lead, not a verdict)', () => {
  it.each(REASON_CODES)('renders %s neutrally with its points', (code) => {
    const text = reasonText(reason(code));
    expect(text).toMatch(/\(\+4 points\)$/);
    expect(text).not.toMatch(/undefined|NaN|\{|\}/);
    expect(violatesWording(text)).toBe(false);
  });

  it('says the pattern and graph layers count only their largest reason', () => {
    const r = { ...reason('pattern_match'), layer: 'pattern' as const, points: 18 };
    expect(reasonText(r)).toMatch(/\(18 points; the layer counts only its largest\)$/);
  });

  it('keeps the evidence status in the text (B-36)', () => {
    expect(reasonText(reason('public_record_after_disbursement'))).toContain(
      'Evidence status: allegation.',
    );
  });

  it('uses only the three band labels', () => {
    expect(Object.values(RISK_BAND_LABELS)).toEqual([
      'Routine review',
      'Needs attention',
      'Urgent review',
    ]);
  });
});

describe('the "what changed" block', () => {
  const a = reason('late_emi', 'late_emi|L-1');
  const b = reason('missed_emi', 'missed_emi|L-1', 8);
  const c = reason('receipts_fall', 'receipts_fall|L-1', 1);

  it('splits reasons into new, unchanged and no longer present', () => {
    const block = changeBlock(
      { score: 22, band: 'routine', reasons: [a, c] },
      { score: 41, band: 'needs_attention', reasons: [a, b] },
    );
    expect(block.fresh).toEqual([b]);
    expect(block.unchanged).toEqual([a]);
    expect(block.gone).toEqual([c]);
    const text = formatChangeBlock(block);
    expect(text).toContain('New since last check:\n- 2 EMIs were not paid');
    expect(text).toContain('Unchanged:\n- 1 EMI was paid after the grace period');
    expect(text).toContain('No longer present:\n- Receipts into the account fell');
    expect(text).toContain('Score change: 22 → 41 (+19). Band: Routine review → Needs attention.');
  });

  it('says "none" for an empty section and handles a first score', () => {
    const text = formatChangeBlock(changeBlock(null, { score: 0, band: 'routine', reasons: [] }));
    expect(text).toBe(
      'New since last check:\n- none\nUnchanged:\n- none\nFirst score: 0 (Routine review).',
    );
  });

  it('shows a fall with its sign and keeps one band label when the band holds', () => {
    const text = formatChangeBlock(
      changeBlock(
        { score: 50, band: 'needs_attention', reasons: [] },
        { score: 35, band: 'needs_attention', reasons: [] },
      ),
    );
    expect(text).toContain('Score change: 50 → 35 (-15). Band: Needs attention.');
  });

  it('never shows stale data or a missing library as low risk (B-56)', () => {
    const text = formatChangeBlock(changeBlock(null, { score: 0, band: 'routine', reasons: [] }), {
      staleSince: '2024-12-01',
      noPatterns: true,
    });
    expect(text).toContain('is stale; a lower score is not shown as an improvement');
    expect(text).toContain('its 0 is not low risk');
  });

  it('leaves zero-point reasons out', () => {
    const zero = reason('late_emi', 'z', 0);
    expect(changeBlock(null, { score: 0, band: 'routine', reasons: [zero] }).fresh).toEqual([]);
  });
});
