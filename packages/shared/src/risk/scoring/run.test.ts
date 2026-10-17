import { describe, expect, it } from 'vitest';
import { HAND_WRITTEN_LIBRARY } from '../patterns/handWritten.js';
import type { PatternMatcher } from '../patterns/timeline.js';
import type { RuleTransaction } from '../rules/types.js';
import type { PublicRecord } from './inputs.js';
import { scoreRun, type ScoringLoan, type ScoringRunInput } from './run.js';
import type { LoanScore } from './types.js';
import { SCORING_SETTINGS_V1 as S } from './settings.js';

const loan = (n: number, disbursedAt = '2024-01-10T05:00:00.000Z'): ScoringLoan => ({
  id: `L-${n}`,
  borrowerId: `B-${n}`,
  amountMinor: 1_000_000,
  disbursedAt,
  monitoringDays: 90,
  accountEntityId: `B-${n}-acc`,
});
const record = (entity: string, date: string): PublicRecord => ({
  record_id: `evt_${entity}_${date}`,
  entity_id: entity,
  date,
  case_type: 'ed_provisional_attachment',
  source_id: 'ed',
  evidence_status: 'allegation',
});
/** Most of loan 3 leaves its account within hours: the rapid onward rule fires. */
const rapid: RuleTransaction = {
  id: 'T-3-out',
  at: '2024-01-10T08:00:00.000Z',
  fromId: 'B-3-acc',
  toId: 'X-acc',
  amountMinor: 900_000,
  type: 'rtgs',
};
const noMatch: PatternMatcher = () => null;

const input = (over: Partial<ScoringRunInput> = {}): ScoringRunInput => ({
  asOf: '2024-02-05',
  dataBuiltOn: '2024-02-05',
  missingInputs: [],
  loans: [loan(1), loan(2), loan(3), loan(4, '2024-03-01T05:00:00.000Z')],
  transactions: [rapid],
  entities: [],
  links: [{ from: 'B-2', to: 'P-2', type: 'shares_address', status: 'verified' }],
  records: [record('B-1', '2024-02-01'), record('P-2', '2024-01-20'), record('B-1', '2024-02-20')],
  library: {
    libraryVersion: HAND_WRITTEN_LIBRARY.library_version,
    patterns: HAND_WRITTEN_LIBRARY.patterns,
  },
  matcher: noMatch,
  verifiedCaseIds: new Set(),
  settings: S,
  ...over,
});

describe('one scoring run', () => {
  const out = scoreRun(input());
  const byLoan = new Map(out.scores.map((s) => [s.loan_id, s]));

  it('scores only loans disbursed by as_of', () => {
    expect([...byLoan.keys()]).toEqual(['L-1', 'L-2', 'L-3']);
  });

  it('sends a record after disbursement straight to Urgent review', () => {
    expect(byLoan.get('L-1')).toMatchObject({
      band: 'urgent',
      override: true,
      points: { direct: 40 },
    });
  });

  it('never sees a record dated after as_of (replay-safe)', () => {
    const ids = byLoan.get('L-1')?.reasons.flatMap((r) => r.evidence_ids) ?? [];
    expect(ids).toContain('evt_B-1_2024-02-01');
    expect(ids).not.toContain('evt_B-1_2024-02-20');
  });

  it('scores a flagged neighbour one hop away in the graph layer', () => {
    expect(byLoan.get('L-2')).toMatchObject({ points: { graph: 20 }, band: 'routine' });
  });

  it('maps a fired monitoring rule to its hand-written typology', () => {
    const s = byLoan.get('L-3');
    expect(s?.points.pattern).toBe(18);
    expect(out.firedRules.get('L-3')).toEqual(['rapid_onward']);
    expect(s?.reasons.find((r) => r.code === 'pattern_match')?.evidence_ids).toEqual(['T-3-out']);
  });

  it('marks the whole run no_patterns without a library', () => {
    const none = scoreRun(input({ library: null }));
    expect(none.scores.every((s) => s.no_patterns && s.pattern_version === null)).toBe(true);
    expect(none.findings.map((f) => f.code)).toEqual(['no_patterns']);
  });

  it('is deterministic', () => {
    expect(scoreRun(input())).toEqual(out);
  });
});

describe('a flagged customer', () => {
  const customerRecord = record('B-1-C1', '2024-01-20');
  const pay: RuleTransaction = {
    id: 'T-1-in',
    at: '2024-01-15T08:00:00.000Z',
    fromId: 'B-1-C1-acc',
    toId: 'B-1-acc',
    amountMinor: 1_000,
    type: 'neft',
  };
  const entities = [
    { id: 'B-1-acc', ownerId: 'B-1' },
    { id: 'B-1-C1-acc', ownerId: 'B-1-C1' },
  ];
  const score = (over: Partial<ScoringRunInput> = {}): LoanScore | undefined =>
    scoreRun(
      input({
        links: [],
        loans: [loan(1)],
        transactions: [pay],
        entities,
        records: [customerRecord],
        ...over,
      }),
    ).scores[0];

  it('reaches the graph layer through the trading link, at half (inferred)', () => {
    const s = score();
    expect(s?.points.graph).toBe(10);
    expect(s?.reasons.find((r) => r.code === 'graph_proximity')).toMatchObject({
      subject_id: 'B-1',
      evidence_ids: ['B-1-C1'],
      evidence_statuses: ['inference'],
      facts: { hops: 1, link_status: 'inferred' },
    });
    expect(s?.override).toBe(false);
  });

  it('does not reach the score before the payment, or when there is no payment', () => {
    expect(score({ transactions: [] })?.points.graph).toBe(0);
    expect(score({ asOf: '2024-01-10' })?.points.graph).toBe(0);
  });
});
