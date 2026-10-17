import { describe, expect, it } from 'vitest';
import type { MonitoringDetection } from '../risk/index.js';
import {
  SYNTH_ARCHETYPES,
  SYNTH_RULE_IDS,
  SynthEntitySchema,
  SynthFlagSchema,
  SynthLoanSchema,
  SynthManifestSchema,
  SynthMonthSchema,
  SynthRelationshipSchema,
  SynthTransactionSchema,
  SynthTruthSchema,
} from './schemas.js';

const entity = {
  id: 'B',
  kind: 'company',
  name: 'SYNTH Borrower One',
  subtitle: 'test',
  ownerId: null,
  borrowerId: null,
  synthetic: true,
};
const loan = {
  id: 'L1',
  applicationId: null,
  borrowerId: 'B',
  product: 'msme_term',
  amountMinor: 10_000_000,
  disbursedAt: '2024-01-01T00:00:00.000Z',
  purpose: 'SYNTH test loan',
  monitoringDays: 90,
  accountEntityId: 'B-acc',
  dataSource: 'SYNTHETIC TEST DATA',
  lastUpdated: '2024-01-01',
  branchId: 'br-test',
  synthetic: true,
};
const txn = {
  id: 'T1',
  loanId: 'L1',
  at: '2024-01-02T05:30:00.000Z',
  fromId: 'B-acc',
  toId: 'C-acc',
  amountMinor: 1_000_000,
  type: 'neft',
  reference: 'SYNTH-REF-T1',
  source: 'import',
  synthetic: true,
};
const flag = {
  flag_id: 'F1',
  entity: {
    entity_id: 'ent_synth_1',
    entity_type: 'company',
    canonical_name: 'SYNTH Borrower One',
    cin: null,
    status: null,
    incorporation_date: null,
    jurisdiction: 'IN',
    aliases: [],
    match_method: 'normalized_name',
    sources: ['ibbi'],
    mention_count: 1,
  },
  event: {
    event_id: 'evt_synth_1',
    case_type: 'ibbi_cirp',
    authority: 'SYNTHETIC',
    source_id: 'ibbi',
    document_id: 'doc_synth_1',
    title: 'SYNTH CIRP of Borrower One',
    party_names: ['SYNTH Borrower One'],
    event_date: '2024-06-01',
    publication_date: '2024-06-01',
    proceeding_status: 'cirp_initiated',
    outcome: null,
    appeal_status: null,
    amounts: [],
  },
  evidence_status: 'fact',
  event_date: '2024-06-01',
  synthetic: true,
};
const truth = {
  loan_id: 'L1',
  archetype: 'slow_burn',
  class: 'defaulter',
  onset_month: '2024-06',
  expected_rules: [],
  months: [
    {
      month: '2024-06',
      expected_band: 'needs_attention',
      expected_patterns: [],
      expected_reasons: [],
    },
  ],
  synthetic: true,
};

describe('valid samples', () => {
  it('parse for every schema', () => {
    expect(SynthEntitySchema.safeParse(entity).success).toBe(true);
    expect(
      SynthRelationshipSchema.safeParse({
        id: 'R1',
        from: 'B',
        to: 'C',
        type: 'shares_address',
        status: 'verified',
        source: 'SYNTH',
        observedAt: '2024-01-01',
        evidence: 'SYNTH',
        synthetic: true,
      }).success,
    ).toBe(true);
    expect(SynthLoanSchema.safeParse(loan).success).toBe(true);
    expect(SynthTransactionSchema.safeParse(txn).success).toBe(true);
    expect(SynthFlagSchema.safeParse(flag).success).toBe(true);
    expect(SynthTruthSchema.safeParse(truth).success).toBe(true);
    expect(
      SynthManifestSchema.safeParse({
        seed: 1,
        generator_version: '1',
        as_of_start: '2024-01-01',
        months: 24,
        counts: { transactions: 3 },
        sha256: { 'transactions.jsonl': 'a'.repeat(64) },
        synthetic: true,
      }).success,
    ).toBe(true);
  });
});

describe('rejections that protect the data (B-54, B-01)', () => {
  const rejects = (
    schema: { safeParse: (v: unknown) => { success: boolean } },
    v: unknown,
  ): boolean => !schema.safeParse(v).success;

  it('needs synthetic: true on every record', () => {
    for (const [schema, value] of [
      [SynthEntitySchema, entity],
      [SynthLoanSchema, loan],
      [SynthTransactionSchema, txn],
      [SynthTruthSchema, truth],
    ] as const) {
      expect(rejects(schema, { ...value, synthetic: false })).toBe(true);
      const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'synthetic'));
      expect(rejects(schema, rest)).toBe(true);
    }
  });

  it('needs the SYNTH prefix on entity names and flag organisations', () => {
    expect(rejects(SynthEntitySchema, { ...entity, name: 'Borrower One' })).toBe(true);
    expect(rejects(SynthEntitySchema, { ...entity, name: 'synth Borrower One' })).toBe(true);
    expect(
      rejects(SynthFlagSchema, {
        ...flag,
        entity: { ...flag.entity, canonical_name: 'Borrower One' },
      }),
    ).toBe(true);
  });

  it('needs the SYNTHETIC authority on a flag event and the test data source on a loan', () => {
    expect(rejects(SynthFlagSchema, { ...flag, event: { ...flag.event, authority: 'IBBI' } })).toBe(
      true,
    );
    expect(rejects(SynthLoanSchema, { ...loan, dataSource: 'core banking' })).toBe(true);
  });

  it('keeps amounts as positive safe integers', () => {
    for (const amountMinor of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, Number.NaN])
      expect(rejects(SynthTransactionSchema, { ...txn, amountMinor }), String(amountMinor)).toBe(
        true,
      );
    expect(rejects(SynthLoanSchema, { ...loan, amountMinor: 0 })).toBe(true);
  });

  it('keeps web transaction types, UTC instants and the import source', () => {
    expect(rejects(SynthTransactionSchema, { ...txn, type: 'wire' })).toBe(true);
    expect(rejects(SynthTransactionSchema, { ...txn, at: '2024-01-02' })).toBe(true);
    expect(rejects(SynthTransactionSchema, { ...txn, at: '2024-01-02T10:00:00+05:30' })).toBe(true);
    expect(rejects(SynthTransactionSchema, { ...txn, source: 'demo' })).toBe(true);
  });

  it('rejects an unknown archetype, band or rule, and a malformed month', () => {
    expect(rejects(SynthTruthSchema, { ...truth, archetype: 'bad' })).toBe(true);
    expect(rejects(SynthTruthSchema, { ...truth, expected_rules: ['made_up'] })).toBe(true);
    expect(
      rejects(SynthTruthSchema, {
        ...truth,
        months: [{ ...truth.months[0], expected_band: 'fraud' }],
      }),
    ).toBe(true);
    for (const month of ['2024-13', '2024-00', '24-01', '2024-1', '2024-01-01', ''])
      expect(SynthMonthSchema.safeParse(month).success, month).toBe(false);
    expect(SynthMonthSchema.safeParse('2024-12').success).toBe(true);
  });

  it('needs at least one month of truth', () => {
    expect(rejects(SynthTruthSchema, { ...truth, months: [] })).toBe(true);
  });
});

describe('lists', () => {
  it('has the twelve archetypes of the plan, each once', () => {
    expect(SYNTH_ARCHETYPES).toHaveLength(12);
    expect(new Set(SYNTH_ARCHETYPES).size).toBe(12);
  });

  it('lists exactly the monitoring rules the shared rules can raise', () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const same: Same<(typeof SYNTH_RULE_IDS)[number], MonitoringDetection['rule']> = true;
    expect(same).toBe(true);
    expect(new Set(SYNTH_RULE_IDS).size).toBe(5);
  });
});
