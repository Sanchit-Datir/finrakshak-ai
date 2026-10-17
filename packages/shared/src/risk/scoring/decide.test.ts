import { describe, expect, it } from 'vitest';
import { decideAlert, type AlertState, type ScoredRun } from './decide.js';
import { DEFAULT_SCORING_SETTINGS as S } from './settings.js';
import type { AlertKind, Reason, ReasonCode, RiskBand } from './types.js';

const reason = (key: string, code: ReasonCode = 'late_emi', points = 5): Reason => ({
  code,
  layer: 'behaviour',
  reason_key: key,
  subject_id: 'L-1',
  points,
  evidence_ids: [],
  evidence_statuses: [],
  source: 'transactions',
  facts: {},
  pattern: null,
});

const run = (
  score: number,
  band: RiskBand,
  keys: string[] = [],
  extra: Partial<ScoredRun> = {},
): ScoredRun => ({
  score,
  band,
  override: false,
  stale_inputs: false,
  reasons: keys.map((k) => reason(k)),
  ...extra,
});
const state = (
  score: number,
  held_band: RiskBand,
  reason_keys: string[] = [],
  clean_runs = 0,
): AlertState => ({
  score,
  held_band,
  clean_runs,
  reason_keys,
});
const OVERRIDE: ScoredRun = {
  score: 40,
  band: 'urgent',
  override: true,
  stale_inputs: false,
  reasons: [reason('rec|e1', 'public_record_after_disbursement', 40)],
};

interface Row {
  readonly name: string;
  readonly previous: AlertState | null;
  readonly current: ScoredRun;
  readonly alerted?: string[];
  readonly kind: AlertKind;
  readonly held: RiskBand;
  readonly clean?: number;
}

const TABLE: readonly Row[] = [
  {
    name: 'no change',
    previous: state(20, 'routine', ['a']),
    current: run(20, 'routine', ['a']),
    kind: 'none',
    held: 'routine',
  },
  {
    name: 'band up',
    previous: state(20, 'routine', ['a']),
    current: run(35, 'needs_attention', ['a']),
    kind: 'band_up',
    held: 'needs_attention',
  },
  {
    name: 'band up to urgent',
    previous: state(40, 'needs_attention', ['a']),
    current: run(60, 'urgent', ['a', 'b']),
    kind: 'band_up',
    held: 'urgent',
  },
  {
    name: 'rise of 14 with a new reason',
    previous: state(31, 'needs_attention', ['a']),
    current: run(45, 'needs_attention', ['a', 'b']),
    kind: 'none',
    held: 'needs_attention',
  },
  {
    name: 'rise of 15 with a new reason',
    previous: state(31, 'needs_attention', ['a']),
    current: run(46, 'needs_attention', ['a', 'b']),
    kind: 'rise_with_new_reason',
    held: 'needs_attention',
  },
  {
    name: 'rise of 15 without a new reason',
    previous: state(31, 'needs_attention', ['a']),
    current: run(46, 'needs_attention', ['a']),
    kind: 'none',
    held: 'needs_attention',
  },
  {
    name: 'rise of 15, the new reason already alerted',
    previous: state(31, 'needs_attention', ['a']),
    current: run(46, 'needs_attention', ['a', 'b']),
    alerted: ['b'],
    kind: 'none',
    held: 'needs_attention',
  },
  {
    name: 'rise of 15, a reason back after leaving',
    previous: state(31, 'needs_attention', []),
    current: run(46, 'needs_attention', ['a']),
    kind: 'rise_with_new_reason',
    held: 'needs_attention',
  },
  {
    name: 'fall, first clean run',
    previous: state(50, 'needs_attention', ['a']),
    current: run(10, 'routine'),
    kind: 'none',
    held: 'needs_attention',
    clean: 1,
  },
  {
    name: 'fall, second clean run steps down',
    previous: state(10, 'needs_attention', [], 1),
    current: run(10, 'routine'),
    kind: 'none',
    held: 'routine',
    clean: 0,
  },
  {
    name: 'fall for one run then recovery',
    previous: state(25, 'needs_attention', ['a'], 1),
    current: run(40, 'needs_attention', ['a']),
    kind: 'none',
    held: 'needs_attention',
    clean: 0,
  },
  {
    name: 'back up to the held band is not a step up',
    previous: state(10, 'urgent', [], 1),
    current: run(65, 'urgent', ['a']),
    alerted: ['a'],
    kind: 'none',
    held: 'urgent',
    clean: 0,
  },
  {
    name: 'a run in the held band is not a clean run',
    previous: state(40, 'needs_attention', ['a'], 0),
    current: run(40, 'needs_attention', ['a']),
    kind: 'none',
    held: 'needs_attention',
    clean: 0,
  },
  {
    name: 'stale run neither counts nor resets',
    previous: state(10, 'needs_attention', [], 1),
    current: run(10, 'routine', [], { stale_inputs: true }),
    kind: 'none',
    held: 'needs_attention',
    clean: 1,
  },
  {
    name: 'stale run still alerts on a rise',
    previous: state(20, 'routine', []),
    current: run(35, 'needs_attention', ['a'], { stale_inputs: true }),
    kind: 'band_up',
    held: 'needs_attention',
  },
  {
    name: 'override reason',
    previous: state(0, 'routine'),
    current: OVERRIDE,
    kind: 'override',
    held: 'urgent',
  },
  {
    name: 'override already alerted',
    previous: state(40, 'urgent', ['rec|e1']),
    current: OVERRIDE,
    alerted: ['rec|e1'],
    kind: 'none',
    held: 'urgent',
  },
  {
    name: 'override on the first score',
    previous: null,
    current: OVERRIDE,
    kind: 'override',
    held: 'urgent',
  },
  {
    name: 'first score, routine',
    previous: null,
    current: run(10, 'routine', ['a']),
    kind: 'none',
    held: 'routine',
  },
  {
    name: 'first score, needs attention',
    previous: null,
    current: run(30, 'needs_attention', ['a']),
    kind: 'initial',
    held: 'needs_attention',
  },
  {
    name: 'first score, urgent',
    previous: null,
    current: run(60, 'urgent', ['a']),
    kind: 'initial',
    held: 'urgent',
  },
  {
    name: 'missing previous row',
    previous: null,
    current: run(29, 'routine'),
    kind: 'none',
    held: 'routine',
  },
];

describe('decideAlert', () => {
  it.each(TABLE)('$name', (row) => {
    const d = decideAlert(row.previous, row.current, S, new Set(row.alerted ?? []));
    expect(d.kind).toBe(row.kind);
    expect(d.next.held_band).toBe(row.held);
    if (row.clean !== undefined) expect(d.next.clean_runs).toBe(row.clean);
    expect(d.alert_reason_keys.length === 0).toBe(row.kind === 'none');
  });

  it('reports the delta and the new reasons', () => {
    const d = decideAlert(
      state(31, 'needs_attention', ['a']),
      run(46, 'needs_attention', ['a', 'b']),
      S,
      new Set(),
    );
    expect(d).toMatchObject({ delta: 15, new_reason_keys: ['b'], alert_reason_keys: ['b'] });
    expect(d.next.reason_keys).toEqual(['a', 'b']);
  });

  it('ignores reasons that add no points', () => {
    const current = {
      ...run(46, 'needs_attention', ['a']),
      reasons: [reason('a'), reason('zero', 'late_emi', 0)],
    };
    expect(decideAlert(state(31, 'needs_attention', ['a']), current, S, new Set()).kind).toBe(
      'none',
    );
  });

  it('steps down after the configured number of clean runs', () => {
    const three = { ...S, alert: { ...S.alert, clean_runs_to_step_down: 3 } };
    const d = decideAlert(state(10, 'urgent', [], 1), run(10, 'routine'), three, new Set());
    expect(d.next).toMatchObject({ held_band: 'urgent', clean_runs: 2 });
  });
});
