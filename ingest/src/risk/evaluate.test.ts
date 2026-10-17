import { describe, expect, it } from 'vitest';
import type {
  AlertKind,
  LoanScore,
  MonitoringRuleId,
  Reason,
  RiskBand,
  SynthTruth,
} from '@fund-tracker/shared';
import { evaluate, reasonCodesOf } from './evaluate.js';
import type { ReplayRow } from './replay.js';

const reason = (code: Reason['code'], facts: Reason['facts'] = {}): Reason => ({
  code,
  layer: 'behaviour',
  reason_key: `${code}|x`,
  subject_id: 'x',
  points: 4,
  evidence_ids: [],
  evidence_statuses: [],
  source: 'transactions',
  facts,
  pattern: null,
});

const row = (
  loan: string,
  month: string,
  band: RiskBand,
  kind: AlertKind,
  reasons: Reason[] = [],
  fired: MonitoringRuleId[] = [],
): ReplayRow => {
  const score: LoanScore = {
    score_id: `s_${loan}_${month}`,
    loan_id: loan,
    borrower_id: `B-${loan}`,
    as_of: `${month}-28`,
    score: 0,
    band,
    override: false,
    points: { direct: 0, pattern: 0, graph: 0, behaviour: 0 },
    reasons,
    settings_version: 'v1',
    pattern_version: 1,
    data_built_on: `${month}-28`,
    stale_inputs: false,
    no_patterns: false,
  };
  return {
    month,
    score,
    held_band: band,
    alert: { kind, delta: null, new_reason_keys: [], alert_reason_keys: [] },
    fired_rules: fired,
    change_text: '',
  };
};

const truth = (
  loan: string,
  archetype: SynthTruth['archetype'],
  cls: SynthTruth['class'],
  onset: string | null,
  months: SynthTruth['months'],
  rules: SynthTruth['expected_rules'] = [],
): SynthTruth => ({
  loan_id: loan,
  archetype,
  class: cls,
  onset_month: onset,
  expected_rules: rules,
  months,
  synthetic: true,
});
const m = (
  month: string,
  band: RiskBand,
  reasons: string[] = [],
): SynthTruth['months'][number] => ({
  month,
  expected_band: band,
  expected_patterns: [],
  expected_reasons: reasons,
});

describe('evaluation against SYNTH truth (B-55: plumbing, not accuracy)', () => {
  it('maps a typology pattern to its rule id', () => {
    const score = row('L', '2024-01', 'routine', 'none', [
      reason('pattern_match', { rule_id: 'rapid_onward' }),
      reason('late_emi'),
    ]).score;
    expect([...reasonCodesOf(score)].sort()).toEqual(['late_emi', 'rapid_onward']);
  });

  it('counts on-time alerts, missed defaulters, alerted controls, rules and band agreement', () => {
    const rows = [
      row('D1', '2024-01', 'routine', 'none'),
      row('D1', '2024-02', 'urgent', 'override', [reason('public_record_after_disbursement')]),
      row('D2', '2024-01', 'routine', 'none'),
      row('D2', '2024-05', 'needs_attention', 'band_up'),
      row('C1', '2024-01', 'routine', 'none', [], ['rapid_onward']),
      row('C1', '2024-02', 'needs_attention', 'band_up'),
    ];
    const t = [
      truth('D1', 'sudden_enforcement', 'defaulter', '2024-02', [
        m('2024-01', 'routine'),
        m('2024-02', 'urgent', ['public_record_after_disbursement']),
      ]),
      truth('D2', 'slow_burn', 'defaulter', '2024-02', [
        m('2024-01', 'routine'),
        m('2024-05', 'urgent', ['late_emi']),
      ]),
      truth(
        'C1',
        'control',
        'control',
        null,
        [m('2024-01', 'routine'), m('2024-02', 'routine')],
        ['circular'],
      ),
    ];
    const report = evaluate(rows, t, 2);
    expect(report).toMatchObject({
      loans: 3,
      months: 3,
      alerts: 3,
      alerts_per_1000_loans_per_month: 500,
    });
    expect(report.defaulters_missed).toEqual(['D2 (slow_burn)']);
    expect(report.controls_alerted).toEqual(['C1 (control)']);
    expect(report.rules).toEqual({
      expected: 1,
      found: 0,
      missing: ['C1:circular'],
      unexpected: ['C1:rapid_onward'],
    });
    expect(report.by_archetype['sudden_enforcement']).toMatchObject({
      alerted_in_window: 1,
      band_agreement_percent: 100,
      expected_reasons_found_percent: 100,
    });
    expect(report.by_archetype['slow_burn']).toMatchObject({
      alerted_in_window: 0,
      band_agreement_percent: 50,
      expected_reasons_found_percent: 0,
    });
    expect(report.by_class.control).toEqual({ loans: 1, loans_alerted: 1, alerts: 1 });
  });

  it('counts an alert at the edge of the window, not one month after it', () => {
    const t = [truth('D', 'slow_burn', 'defaulter', '2024-02', [m('2024-04', 'needs_attention')])];
    expect(
      evaluate([row('D', '2024-04', 'needs_attention', 'band_up')], t, 2).defaulters_missed,
    ).toEqual([]);
    expect(
      evaluate([row('D', '2024-05', 'needs_attention', 'band_up')], t, 2).defaulters_missed,
    ).toHaveLength(1);
    expect(
      evaluate([row('D', '2024-01', 'needs_attention', 'band_up')], t, 2).defaulters_missed,
    ).toHaveLength(1);
  });

  it('flags a pattern match on a held-out loan', () => {
    const t = [truth('H', 'dormant_burst', 'held_out', '2024-03', [m('2024-03', 'routine')])];
    const r = row('H', '2024-03', 'routine', 'none', [
      reason('pattern_match', { rule_id: 'cash_split' }),
    ]);
    expect(evaluate([r], t, 2).held_out_pattern_matches).toEqual(['H']);
  });
});
