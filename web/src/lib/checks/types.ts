/** Finding, evidence and cross-check types shared by every check. */

import type { Application, Db, FtDocument, Priority } from '../../domain/schemas.js';

/**
 * Deterministic pre-disbursement checks (spec §7 step 4, §8). They run in the
 * browser over the application form and reviewed document fields. Findings are
 * prompts for human verification, not lending decisions.
 */

export type FindingCategory =
  | 'document_inconsistency'
  | 'missing_document'
  | 'duplicate_identifier'
  | 'entity_relationship'
  | 'financial_mismatch'
  | 'collateral_conflict'
  | 'purpose_evidence_gap'
  | 'evidence_incomplete'
  | 'counterparty_exposure'
  | 'post_disbursement_record';

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  document_inconsistency: 'Document inconsistency',
  missing_document: 'Missing required document',
  duplicate_identifier: 'Duplicate identifier',
  entity_relationship: 'Relationship requiring review',
  financial_mismatch: 'Financial-information mismatch',
  collateral_conflict: 'Collateral information conflict',
  purpose_evidence_gap: 'Loan-purpose evidence gap',
  evidence_incomplete: 'Evidence incomplete',
  counterparty_exposure: 'Customer / counterparty exposure (public records)',
  post_disbursement_record: 'Public record after disbursement',
};

export interface EvidenceRef {
  label: string;
  value: string;
  docId: string | null;
  fieldId: string | null;
  appId: string | null;
  /** External source (e.g. an IBBI or ED document) for public-record evidence. */
  url?: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  category: FindingCategory;
  priority: Priority;
  certainty: string;
  observed: string;
  whyItMatters: string;
  evidence: EvidenceRef[];
  known: string[];
  unknown: string[];
  benign: string[];
  steps: string[];
}

export type CrossVerdict = 'match' | 'variation' | 'conflict' | 'not_available';

export interface CrossCheck {
  label: string;
  formValue: string;
  docValue: string;
  docId: string | null;
  fieldId: string | null;
  verdict: CrossVerdict;
  note: string;
}

export interface Ctx {
  app: Application;
  docs: FtDocument[];
  db: Db;
}

export type Check = (ctx: Ctx) => Finding[];
