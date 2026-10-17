/**
 * How a public-record `case_type` counts in a risk check. Only these case types become records;
 * everything else (NFRA orders, RBI penalties, press releases, voluntary liquidations) does not.
 */
export const RECORD_KINDS = ['insolvency', 'liquidation', 'enforcement'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

const KIND_BY_CASE_TYPE: ReadonlyMap<string, RecordKind> = new Map<string, RecordKind>([
  ['ibbi_cirp', 'insolvency'],
  ['ibbi_liquidation', 'liquidation'],
  ['ed_provisional_attachment', 'enforcement'],
  ['ed_search_seizure', 'enforcement'],
  ['ed_prosecution_complaint', 'enforcement'],
  ['ed_arrest', 'enforcement'],
  ['ed_conviction', 'enforcement'],
  ['ed_feo_declaration', 'enforcement'],
  ['sfio_conviction_list', 'enforcement'],
  ['sfio_proclaimed_offenders', 'enforcement'],
  ['sebi_final_order', 'enforcement'],
  ['sebi_interim_order', 'enforcement'],
  ['rbi_licence_cancellation', 'enforcement'],
  ['rbi_cor_cancellation', 'enforcement'],
]);

/** The record kind of a case type, or undefined when it is not a record for the risk check. */
export const recordKindOf = (caseType: string): RecordKind | undefined =>
  KIND_BY_CASE_TYPE.get(caseType);

/** Every case type that counts as a record, in a stable order. */
export const RECORD_CASE_TYPES: readonly string[] = [...KIND_BY_CASE_TYPE.keys()];
