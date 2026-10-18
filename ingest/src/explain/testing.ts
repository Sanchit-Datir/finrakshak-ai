import type { Reason, RiskAlertDoc } from '@finrakshak-ai/shared';

/** Builders for the explainer's tests. Every id and value is invented (SYNTH). */

export const reason = (over: Partial<Reason> = {}): Reason => ({
  code: 'public_record_after_disbursement',
  layer: 'direct',
  reason_key: 'direct:ed:e1',
  subject_id: 'B-0005',
  points: 40,
  evidence_ids: ['e1'],
  evidence_statuses: ['allegation'],
  source: 'ed',
  facts: { date: '2025-05-26', case_type: 'ed_provisional_attachment', row: 'after' },
  pattern: null,
  ...over,
});

export const alert = (over: Partial<RiskAlertDoc> = {}): RiskAlertDoc => ({
  alert_id: 'L-0005_abc',
  loan_id: 'L-0005',
  branch_id: 'br-synth',
  borrower_id: 'B-0005',
  run_id: 'run_1',
  as_of: '2025-09-30',
  kind: 'band_up',
  band: 'needs_attention',
  score: 49,
  delta: 40,
  reasons: [
    reason(),
    reason({
      code: 'related_party_record',
      reason_key: 'direct:rel:D-0003',
      subject_id: 'D-0003',
      points: 9,
      evidence_statuses: ['fact'],
      source: 'ibbi',
      facts: { date: '2025-06-01', case_type: 'ibbi_cirp', director: 'D-0003' },
    }),
  ],
  change_text: 'New since last check: ...',
  settings_version: 'v2',
  data_built_on: '2025-09-30',
  created_at: '2025-09-30T18:30:00.000Z',
  status: 'open',
  synthetic: true,
  ...over,
});
