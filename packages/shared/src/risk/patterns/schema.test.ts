import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CandidateStatsSchema,
  PatternDefinitionSchema,
  PatternLibrarySchema,
  PatternProposalSchema,
  PatternSchema,
  type Pattern,
} from './schema.js';

const raw: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/library.sample.json', import.meta.url), 'utf8'),
);
const library = PatternLibrarySchema.parse(raw);
const byTemplate = (t: string): Pattern => {
  const found = library.patterns.find(
    (p) => p.definition.template === t && p.status === 'approved',
  );
  if (found === undefined) throw new Error(`fixture has no approved ${t} pattern`);
  return found;
};
const sequence = byTemplate('sequence');
const minerDraft = (): unknown => ({
  ...structuredClone(sequence),
  status: 'draft',
  approved_by: null,
  approved_at: null,
});

describe('the fixture library', () => {
  it('is valid and has one approved pattern per template plus a retired one', () => {
    expect(library.patterns.map((p) => `${p.definition.template}:${p.status}`).sort()).toEqual([
      'co_occurrence:approved',
      'graph_proximity:approved',
      'sequence:approved',
      'sequence:retired',
      'transaction_typology:approved',
    ]);
  });
});

describe('Pattern: one rule per rejection', () => {
  const change = (fn: (p: Record<string, unknown>) => void): boolean => {
    const p: Record<string, unknown> = { ...structuredClone(sequence) };
    fn(p);
    return PatternSchema.safeParse(p).success;
  };
  const support = (p: Record<string, unknown>): Record<string, unknown> =>
    p['support'] as Record<string, unknown>;

  it.each<[string, (p: Record<string, unknown>) => void]>([
    ['schema_version 2', (p) => void (p['schema_version'] = 2)],
    ['pattern_id of the wrong shape', (p) => void (p['pattern_id'] = 'pat_123')],
    ['version 0', (p) => void (p['version'] = 0)],
    ['a name of two characters', (p) => void (p['name'] = 'ab')],
    ['a name with a verdict word', (p) => void (p['name'] = 'Fraud sequence before insolvency')],
    [
      'a description with a verdict word',
      (p) => void (p['description'] = 'A sequence that shows fraudulent intent by the entity.'),
    ],
    ['no benign explanation', (p) => void (p['benign_explanations'] = [])],
    [
      'six benign explanations',
      (p) => void (p['benign_explanations'] = Array.from({ length: 6 }, () => 'x')),
    ],
    [
      'a benign explanation with a verdict word',
      (p) => void (p['benign_explanations'] = ['A criminal case is not implied.']),
    ],
    ['an unknown origin', (p) => void (p['origin'] = 'model')],
    ['an unknown evidence status', (p) => void (p['evidence_statuses'] = ['proven'])],
    ['created_at that is not a datetime', (p) => void (p['created_at'] = 'yesterday')],
    ['an approved pattern without approved_by', (p) => void (p['approved_by'] = null)],
    [
      'an approved pattern that is also retired',
      (p) => void (p['retired_at'] = '2026-10-17T12:00:00.000Z'),
    ],
    ['a draft that carries an approval', (p) => void (p['status'] = 'draft')],
    ['a retired pattern without retired_at', (p) => void (p['status'] = 'retired')],
    ['a pattern that supersedes itself', (p) => void (p['supersedes'] = p['pattern_id'])],
    [
      'mined support with one case',
      (p) =>
        void Object.assign(support(p), { supporting_case_ids: ['dhfl'], supporting_case_count: 1 }),
    ],
    ['mined support without a baseline', (p) => void (support(p)['population'] = null)],
    [
      'a case count that disagrees with the ids',
      (p) => void (support(p)['supporting_case_count'] = 5),
    ],
    [
      'duplicate supporting case ids',
      (p) =>
        void Object.assign(support(p), {
          supporting_case_ids: ['dhfl', 'dhfl', 'ilfs'],
          supporting_case_count: 3,
        }),
    ],
    [
      'a case id with capitals',
      (p) =>
        void Object.assign(support(p), {
          supporting_case_ids: ['DHFL', 'ilfs', 'x'],
          supporting_case_count: 3,
        }),
    ],
    [
      'follow_on above n',
      (p) =>
        void Object.assign(support(p)['population'] as Record<string, unknown>, {
          follow_on: 9999,
        }),
    ],
    [
      'a miner pattern with hypothesis support',
      (p) =>
        void Object.assign(support(p), {
          basis: 'hand_written_hypothesis',
          supporting_case_ids: [],
          supporting_case_count: 0,
          population: null,
        }),
    ],
  ])('rejects %s', (_label, fn) => {
    expect(change(fn)).toBe(false);
  });

  it('accepts the unchanged pattern', () => {
    expect(change(() => undefined)).toBe(true);
  });

  it('rejects a hypothesis that claims to come from the miner, and a typology from the miner', () => {
    const typology = byTemplate('transaction_typology');
    expect(PatternSchema.safeParse({ ...typology, origin: 'miner' }).success).toBe(false);
    const graph = byTemplate('graph_proximity');
    expect(PatternSchema.safeParse({ ...graph, origin: 'miner' }).success).toBe(false);
  });

  it('ignores unknown extra fields, so additive changes do not break older readers', () => {
    const parsed = PatternSchema.parse({ ...sequence, future_field: 'x' });
    expect('future_field' in parsed).toBe(false);
  });
});

describe('PatternDefinition bounds', () => {
  const seq = (over: Record<string, unknown>): boolean =>
    PatternDefinitionSchema.safeParse({ ...sequence.definition, ...over }).success;
  const step = { by: 'kind', value: 'enforcement' };

  it('limits months, steps, hops and the hub switch', () => {
    expect(seq({ max_gap_months: 0 })).toBe(false);
    expect(seq({ max_gap_months: 1 })).toBe(true);
    expect(seq({ max_gap_months: 60 })).toBe(true);
    expect(seq({ max_gap_months: 61 })).toBe(false);
    expect(seq({ min_lead_months: -1 })).toBe(false);
    expect(seq({ steps: [step] })).toBe(false);
    expect(seq({ steps: [step, step, step, step] })).toBe(true);
    expect(seq({ steps: [step, step, step, step, step] })).toBe(false);
    const graph = byTemplate('graph_proximity').definition;
    const g = (over: Record<string, unknown>): boolean =>
      PatternDefinitionSchema.safeParse({ ...graph, ...over }).success;
    expect(g({ max_hops: 0 })).toBe(false);
    expect(g({ max_hops: 3 })).toBe(true);
    expect(g({ max_hops: 4 })).toBe(false);
    expect(g({ exclude_hubs: false })).toBe(false);
  });

  it('rejects an unknown template, rule id, step kind and malformed case_type', () => {
    expect(
      PatternDefinitionSchema.safeParse({ template: 'free_text', text: 'anything' }).success,
    ).toBe(false);
    expect(
      PatternDefinitionSchema.safeParse({ template: 'transaction_typology', rule_id: 'made_up' })
        .success,
    ).toBe(false);
    expect(seq({ steps: [step, { by: 'kind', value: 'fraud' }] })).toBe(false);
    expect(seq({ steps: [step, { by: 'case_type', value: 'ED Search' }] })).toBe(false);
    expect(seq({ steps: [step, { by: 'source', value: 'not_a_source' }] })).toBe(false);
  });
});

describe('PatternLibrary envelope', () => {
  it('requires patterns sorted by pattern_id with no duplicates', () => {
    const reversed = { ...library, patterns: [...library.patterns].reverse() };
    expect(PatternLibrarySchema.safeParse(reversed).success).toBe(false);
    const first = library.patterns[0];
    if (first === undefined) throw new Error('empty fixture');
    expect(PatternLibrarySchema.safeParse({ ...library, patterns: [first, first] }).success).toBe(
      false,
    );
  });
  it('rejects a content_hash that is not sha256 hex', () => {
    expect(PatternLibrarySchema.safeParse({ ...library, content_hash: 'abc' }).success).toBe(false);
  });
});

describe('PatternProposal', () => {
  const candidate = {
    support_case_ids: ['dhfl', 'ilfs', 'reliance_adag_finance'],
    population: { n: 420, follow_on: 36, lift: 2.4 },
    gap_months: { median: 8.5, p25: 6, p75: 11 },
    leave_one_out: { passed: true, failed_without: [] },
    lead_time: { passed: true, min_months: 3 },
  };
  const proposal = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    proposal_id: 'prop_1',
    run_id: 'run_1',
    pattern: minerDraft(),
    candidate,
    model: null,
    prompt_version: 'mine.v1',
    input_hash: 'a'.repeat(64),
    status: 'proposed',
    created_at: '2026-10-17T00:00:00.000Z',
    expires_at: '2026-11-16T00:00:00.000Z',
    decided_at: null,
    decided_by: null,
    ...over,
  });

  it('accepts a draft pattern from the miner with its candidate numbers', () => {
    expect(CandidateStatsSchema.safeParse(candidate).success).toBe(true);
    expect(PatternProposalSchema.safeParse(proposal()).success).toBe(true);
  });
  it('rejects a pattern that is not a draft or not from the miner', () => {
    expect(PatternProposalSchema.safeParse(proposal({ pattern: sequence })).success).toBe(false);
    const handWritten = byTemplate('graph_proximity');
    const draft = { ...handWritten, status: 'draft', approved_by: null, approved_at: null };
    expect(PatternProposalSchema.safeParse(proposal({ pattern: draft })).success).toBe(false);
  });
  it('rejects a bad input_hash and an unknown status', () => {
    expect(PatternProposalSchema.safeParse(proposal({ input_hash: 'nope' })).success).toBe(false);
    expect(PatternProposalSchema.safeParse(proposal({ status: 'applied' })).success).toBe(false);
  });
});
