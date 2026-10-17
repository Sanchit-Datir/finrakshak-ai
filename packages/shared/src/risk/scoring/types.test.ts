import { describe, expect, it } from 'vitest';
import { ReasonSchema, type Reason } from './types.js';

const reason: Reason = {
  code: 'late_emi',
  layer: 'behaviour',
  reason_key: 'late_emi|L-1',
  subject_id: 'L-1',
  points: 4,
  evidence_ids: ['T-1', 'emi:L-1:6'],
  evidence_statuses: ['fact'],
  source: 'transactions',
  facts: { count: 1 },
  pattern: null,
};

describe('reason schema', () => {
  it('holds event, transaction and neighbour ids in evidence_ids', () => {
    expect(ReasonSchema.parse(reason).evidence_ids).toEqual(['T-1', 'emi:L-1:6']);
  });

  it('no longer accepts the old evidence_event_ids name', () => {
    const { evidence_ids, ...rest } = reason;
    expect(evidence_ids).toHaveLength(2);
    expect(ReasonSchema.safeParse({ ...rest, evidence_event_ids: evidence_ids }).success).toBe(
      false,
    );
  });
});
