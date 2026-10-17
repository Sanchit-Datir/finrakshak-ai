import { describe, expect, it } from 'vitest';
import { directLayer, type DirectInput } from './direct.js';
import type { PublicRecord } from './inputs.js';
import { DEFAULT_SCORING_SETTINGS as S, type ScoringSettings } from './settings.js';

const rec = (id: string, over: Partial<PublicRecord> = {}): PublicRecord => ({
  record_id: id,
  entity_id: 'B-1',
  date: '2024-06-01',
  case_type: 'ed_provisional_attachment',
  source_id: 'ed',
  evidence_status: 'allegation',
  ...over,
});

const input = (records: PublicRecord[], over: Partial<DirectInput> = {}): DirectInput => ({
  borrowerId: 'B-1',
  disbursedOn: '2024-03-15',
  asOf: '2024-12-31',
  relatedPartyIds: ['P-1'],
  records,
  ...over,
});

describe('direct match layer', () => {
  it('scores 40 and sets the override for a record after disbursement', () => {
    const r = directLayer(input([rec('e1')]), S);
    expect(r).toMatchObject({ points: 40, override: true });
    expect(r.reasons[0]).toMatchObject({
      code: 'public_record_after_disbursement',
      points: 40,
      evidence_ids: ['e1'],
      evidence_statuses: ['allegation'],
    });
  });

  it('treats a record on the disbursement day as before it, and the next day as after', () => {
    const same = directLayer(input([rec('e1', { date: '2024-03-15' })]), S);
    expect(same).toMatchObject({ points: 25, override: false });
    const next = directLayer(input([rec('e1', { date: '2024-03-16' })]), S);
    expect(next).toMatchObject({ points: 40, override: true });
  });

  it('ignores records after as_of, undated records and case types that are not records', () => {
    const r = directLayer(
      input([
        rec('late', { date: '2025-01-01' }),
        rec('undated', { date: null }),
        rec('press', { case_type: 'ed_press_release' }),
      ]),
      S,
    );
    expect(r).toEqual({ points: 0, reasons: [], override: false });
  });

  it('scores an NFRA record 15', () => {
    const r = directLayer(
      input([
        rec('n1', { case_type: 'nfra_order', source_id: 'nfra', evidence_status: 'finding' }),
      ]),
      S,
    );
    expect(r.points).toBe(15);
    expect(r.reasons[0]?.code).toBe('nfra_finding');
  });

  it('adds 10 for two proceedings and 15 (not 10) for three sources, capped at 40', () => {
    const two = directLayer(
      input([rec('a', { date: '2024-01-01' }), rec('b', { date: '2024-02-01' })]),
      S,
    );
    expect(two.reasons.map((x) => x.code)).toContain('several_proceedings');
    expect(two.points).toBe(40);
    const before = { date: '2024-01-01' };
    const one = directLayer(input([rec('a', before)]), S);
    expect(one.reasons.map((x) => x.code)).not.toContain('several_proceedings');
    const three = directLayer(
      input([
        rec('a', { ...before, source_id: 'ed' }),
        rec('b', { ...before, source_id: 'sebi', case_type: 'sebi_final_order' }),
        rec('c', { ...before, source_id: 'nfra', case_type: 'nfra_order' }),
      ]),
      S,
    );
    const breadth = three.reasons.find((x) => x.code === 'many_sources');
    expect(breadth?.points).toBe(15);
    expect(three.points).toBe(40);
  });

  it('counts a director or owner record at half, never as an override', () => {
    const r = directLayer(input([rec('d1', { entity_id: 'P-1', date: '2024-01-01' })]), S);
    expect(r).toMatchObject({ points: 13, override: false });
    expect(r.reasons[0]).toMatchObject({ code: 'related_party_record', subject_id: 'P-1' });
    const after = directLayer(input([rec('d2', { entity_id: 'P-1' })]), S);
    expect(after).toMatchObject({ points: 20, override: false });
  });

  it('ignores records on unrelated entities', () => {
    expect(directLayer(input([rec('x', { entity_id: 'Z-9' })]), S).points).toBe(0);
  });

  it('weights non-override rows by evidence status, but never the override row (B-36)', () => {
    const half: ScoringSettings = {
      ...S,
      direct: { ...S.direct, status_percent: { ...S.direct.status_percent, allegation: 50 } },
    };
    expect(directLayer(input([rec('a', { date: '2024-01-01' })]), half).points).toBe(13);
    expect(directLayer(input([rec('b')]), half).points).toBe(40);
  });

  it('keeps an unknown evidence status as unknown', () => {
    const r = directLayer(input([rec('a', { evidence_status: 'confirmed' })]), S);
    expect(r.reasons[0]?.evidence_statuses).toEqual(['unknown']);
  });
});
