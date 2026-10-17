import type {
  AlertStatus,
  ApplicationSection,
  ApplicationStatus,
  BorrowerType,
  CaseStatus,
  EntityKind,
  Evidence,
  FieldState,
  FindingStatus,
  Language,
  LinkStatus,
  LoanProduct,
  Priority,
  ProcessingState,
  RelationshipType,
  Role,
  TransactionType,
} from './schemas.js';

export const ROLE_LABEL: Record<Role, string> = {
  branch_officer: 'Branch Officer',
  branch_manager: 'Branch Manager',
  risk_analyst: 'Risk Analyst',
  investigator: 'Investigator',
  administrator: 'Administrator',
};

export const BORROWER_TYPE_LABEL: Record<BorrowerType, string> = {
  individual: 'Individual',
  farmer: 'Farmer / agricultural',
  proprietorship: 'Proprietorship',
  partnership: 'Partnership',
  private_limited: 'Private limited company',
  other: 'Other',
};

export const PRODUCT_LABEL: Record<LoanProduct, string> = {
  kcc_crop: 'Kisan Credit Card (crop)',
  agri_term: 'Farmer loan',
  warehouse_receipt: 'Warehouse receipt loan',
  msme_working_capital: 'MSME loan',
  msme_term: 'MSME term loan',
  personal: 'Personal loan',
  business: 'Business loan',
  education: 'Education loan',
};

/** Products offered on a new application; the others remain only on existing records. */
export const APPLICATION_PRODUCTS: readonly LoanProduct[] = [
  'business',
  'education',
  'msme_working_capital',
  'agri_term',
];

export const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  documents_needed: 'Documents needed',
  processing: 'Processing',
  needs_review: 'Needs review',
  ready_for_decision: 'Ready for decision',
  approved: 'Approved',
  declined: 'Declined',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  routine: 'Routine review',
  needs_attention: 'Needs attention',
  urgent: 'Urgent review',
};

export const PRIORITY_HELP: Record<Priority, string> = {
  routine:
    'No configured check raised an item in the available data. This is not a guarantee of safety.',
  needs_attention: 'One or more inconsistencies or patterns need verification.',
  urgent:
    'A configured high-priority pattern or significant evidence gap needs timely human attention.',
};

export const PRIORITY_RANK: Record<Priority, number> = {
  routine: 0,
  needs_attention: 1,
  urgent: 2,
};

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  new: 'New',
  in_review: 'In review',
  escalated: 'Escalated',
  resolved: 'Resolved',
  false_positive: 'False positive',
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  new: 'New',
  triage: 'Triage',
  in_review: 'In review',
  information_requested: 'Information requested',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  needs_review: 'Needs review',
  in_review: 'In review',
  resolved: 'Resolved',
  not_an_issue: 'Not an issue',
};

export const FIELD_STATE_LABEL: Record<FieldState, string> = {
  unreviewed: 'Unreviewed',
  confirmed: 'Confirmed by user',
  corrected: 'Corrected',
  unclear: 'Unclear',
};

export const PROCESSING_LABEL: Record<ProcessingState, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  processing: 'Processing',
  needs_review: 'Needs review',
  completed: 'Completed',
  failed: 'Failed / retry available',
};

export const LANGUAGE_LABEL: Record<Language, string> = {
  mr: 'Marathi',
  en: 'English',
  hi: 'Hindi',
  mixed: 'Mixed (Marathi + English)',
  other: 'Other',
};

export const TXN_TYPE_LABEL: Record<TransactionType, string> = {
  disbursement: 'Disbursement',
  neft: 'NEFT',
  rtgs: 'RTGS',
  imps: 'IMPS',
  upi: 'UPI',
  cheque: 'Cheque',
  cash_withdrawal: 'Cash withdrawal',
  repayment: 'Repayment',
};

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  individual: 'Individual',
  company: 'Company / firm',
  account: 'Bank account',
  loan: 'Loan',
  document: 'Document',
  proceeding: 'Proceeding',
  counterparty: 'Counterparty',
};

export const REL_LABEL: Record<RelationshipType, string> = {
  director_of: 'Director of',
  owner_of: 'Owner / partner of',
  borrower_for: 'Borrower for',
  guarantor_for: 'Guarantor for',
  shared_identifier: 'Shared document / identifier',
  same_proceeding: 'Appears in same proceeding',
  shares_address: 'Shares address / contact',
  account_of: 'Account held by',
};

export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  verified: 'Verified from document',
  user_provided: 'User-provided',
  inferred: 'Inferred / possible match',
};

export const EVIDENCE_STATUS_LABEL: Record<Evidence['status'], string> = {
  verified_source: 'Verified source',
  user_provided: 'User-provided',
  unverified: 'Unverified',
  contradicted: 'Contradicted',
};

export const EVIDENCE_TYPE_LABEL: Record<Evidence['sourceType'], string> = {
  uploaded_document: 'Uploaded document',
  transaction_record: 'Transaction record',
  public_filing: 'Public filing',
  judgment_order: 'Judgment / order',
  internal_record: 'Internal record',
};

export const SECTION_LABEL: Record<ApplicationSection, string> = {
  applicant: 'Applicant information',
  loan: 'Loan details',
  address: 'Address and contact',
  financial: 'Income / financial details',
  collateral: 'Collateral details',
  business: 'Business details',
  guarantor: 'Guarantor / co-borrower',
  declaration: 'Declaration and loan purpose',
  receivables: 'Trade receivables (largest customers)',
};

export const DISCLAIMERS = [
  'OCR extraction does not establish document authenticity.',
  'A relationship does not establish wrongdoing.',
  'An alert is not a fraud determination.',
  'Results depend on the completeness and quality of available data.',
  'Public-source data may be incomplete, delayed or ambiguous.',
] as const;
