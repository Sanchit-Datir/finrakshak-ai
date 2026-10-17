import { describe, expect, it } from 'vitest';
import { RECORD_CASE_TYPES, RECORD_KINDS, recordKindOf } from './recordKinds.js';

describe('recordKindOf', () => {
  it('maps insolvency and liquidation case types to their own kinds', () => {
    expect(recordKindOf('ibbi_cirp')).toBe('insolvency');
    expect(recordKindOf('ibbi_liquidation')).toBe('liquidation');
  });

  it('maps enforcement actions from ED, SFIO, SEBI and RBI licence cancellations', () => {
    for (const caseType of [
      'ed_provisional_attachment',
      'ed_search_seizure',
      'ed_prosecution_complaint',
      'ed_arrest',
      'ed_conviction',
      'ed_feo_declaration',
      'sfio_conviction_list',
      'sfio_proclaimed_offenders',
      'sebi_final_order',
      'sebi_interim_order',
      'rbi_licence_cancellation',
      'rbi_cor_cancellation',
    ])
      expect(recordKindOf(caseType), caseType).toBe('enforcement');
  });

  it('does not count case types that are not records for the risk check', () => {
    for (const caseType of [
      'ibbi_voluntary_liquidation',
      'nfra_disciplinary_order',
      'ed_press_release',
      'rbi_monetary_penalty',
      'rbi_alert_list',
      'sfio_notice',
      '',
      'something_new_and_unknown',
    ])
      expect(recordKindOf(caseType), caseType).toBeUndefined();
  });

  it('is not fooled by names that exist on every JavaScript object', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
      expect(recordKindOf(name), name).toBeUndefined();
  });

  it('lists exactly 14 case types, each mapped to one of the three kinds', () => {
    expect(RECORD_CASE_TYPES).toHaveLength(14);
    for (const caseType of RECORD_CASE_TYPES)
      expect(RECORD_KINDS).toContain(recordKindOf(caseType));
  });
});
