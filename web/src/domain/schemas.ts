import {
  AnalyseApplicationResultSchema,
  InvestigateApplicationResultSchema,
  type AnalyseApplicationResult,
  type InvestigateApplicationResult,
} from '@fund-tracker/shared';
import { z } from 'zod';

/**
 * Domain model for the FinRakshak AI prototype. Every persisted value is parsed
 * through these schemas when read back from browser storage (CLAUDE.md: parse,
 * don't cast). Money is integer minor units (paise) — see B-01.
 */

const id = z.string().min(1);
const isoDate = z.string().min(1);
const minor = z.number().int(); // zod int() is limited to the safe-integer range

export const RoleSchema = z.enum([
  'branch_officer',
  'branch_manager',
  'risk_analyst',
  'investigator',
  'administrator',
]);
export type Role = z.infer<typeof RoleSchema>;

export const NoteSchema = z.object({ id, author: z.string(), at: isoDate, text: z.string() });
export type Note = z.infer<typeof NoteSchema>;

export const AuditEntrySchema = z.object({
  id,
  at: isoDate,
  actor: z.string(),
  action: z.string(),
  detail: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const BranchSchema = z.object({ id, name: z.string() });
export type Branch = z.infer<typeof BranchSchema>;

export const BorrowerTypeSchema = z.enum([
  'individual',
  'farmer',
  'proprietorship',
  'partnership',
  'private_limited',
  'other',
]);
export type BorrowerType = z.infer<typeof BorrowerTypeSchema>;

export const BorrowerSchema = z.object({
  id,
  name: z.string(),
  nameOriginal: z.string(),
  type: BorrowerTypeSchema,
  branchId: id,
  relationshipManager: z.string(),
  status: z.enum(['active', 'inactive']),
  maskedIdentifier: z.string(),
  /** CIN / LLPIN / registration number of a business borrower ('' when none). */
  registrationNo: z.string(),
  entityId: id,
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Borrower = z.infer<typeof BorrowerSchema>;

export const LoanProductSchema = z.enum([
  'kcc_crop',
  'agri_term',
  'warehouse_receipt',
  'msme_working_capital',
  'msme_term',
  'personal',
  'business',
  'education',
]);
export type LoanProduct = z.infer<typeof LoanProductSchema>;

export const ApplicationStatusSchema = z.enum([
  'draft',
  'documents_needed',
  'processing',
  'needs_review',
  'ready_for_decision',
  'approved',
  'declined',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const LandUnitSchema = z.enum(['hectare', 'are', 'acre', 'guntha']);
export type LandUnit = z.infer<typeof LandUnitSchema>;

export const ApplicationSectionSchema = z.enum([
  'applicant',
  'loan',
  'address',
  'financial',
  'collateral',
  'business',
  'guarantor',
  'declaration',
  'receivables',
]);
export type ApplicationSection = z.infer<typeof ApplicationSectionSchema>;

/** Largest customers (trade debtors) declared for working-capital assessment (B-25 max length). */
export const MAX_TRADE_CUSTOMERS = 10;
export const TradeCustomerSchema = z.object({
  name: z.string(),
  /** CIN when the applicant knows it; matching to public records prefers it (B-37). */
  cin: z.string(),
  outstandingMinor: minor.nullable(),
  /** Date of the oldest unpaid invoice (YYYY-MM-DD), '' when not given. */
  oldestUnpaidDate: z.string(),
});
export type TradeCustomer = z.infer<typeof TradeCustomerSchema>;

export const ApplicationDataSchema = z.object({
  applicant: z.object({
    fullName: z.string(),
    nameOriginal: z.string(),
    fatherOrSpouse: z.string(),
    dob: z.string(),
    mobile: z.string(),
  }),
  loan: z.object({
    product: LoanProductSchema,
    amountMinor: minor.nullable(),
    tenureMonths: z.number().int().nonnegative().nullable(),
    purpose: z.string(),
  }),
  address: z.object({
    line: z.string(),
    village: z.string(),
    taluka: z.string(),
    district: z.string(),
    pincode: z.string(),
  }),
  financial: z.object({
    occupation: z.string(),
    declaredAnnualIncomeMinor: minor.nullable(),
    existingLiabilitiesMinor: minor.nullable(),
  }),
  collateral: z.object({
    surveyNumber: z.string(),
    landArea: z.string(),
    landUnit: LandUnitSchema,
    warehouseReceiptNo: z.string(),
    collateralValueMinor: minor.nullable(),
  }),
  business: z.object({
    businessName: z.string(),
    registrationNo: z.string(),
    pan: z.string(),
    gstin: z.string(),
    udyamNo: z.string(),
  }),
  receivables: z.object({ customers: z.array(TradeCustomerSchema).max(MAX_TRADE_CUSTOMERS) }),
  guarantor: z.object({ name: z.string(), relation: z.string() }),
  declaration: z.object({ purposeDeclared: z.boolean(), remarks: z.string() }),
});
export type ApplicationData = z.infer<typeof ApplicationDataSchema>;

export const FindingStatusSchema = z.enum([
  'needs_review',
  'in_review',
  'resolved',
  'not_an_issue',
]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const FindingStateSchema = z.object({
  status: FindingStatusSchema,
  comments: z.array(NoteSchema),
});
export type FindingState = z.infer<typeof FindingStateSchema>;

/**
 * Public-records check result saved on the application: the facts found in the local
 * public-records graph (data/graph) at run time, so findings stay reproducible.
 */
export const PrRecordSchema = z.object({
  kind: z.enum(['insolvency', 'liquidation', 'enforcement']),
  caseType: z.string(),
  date: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  evidenceStatus: z.string(),
});
export type PrRecord = z.infer<typeof PrRecordSchema>;

export const PrSubjectSchema = z.object({
  role: z.enum(['applicant', 'customer']),
  inputName: z.string(),
  inputCin: z.string(),
  /**
   * cin = exact CIN; exact_name = exact normalised name; ambiguous = several records share it;
   * via_applicant_record = not declared, found because the applicant filed insolvency against it.
   */
  match: z.enum(['cin', 'exact_name', 'ambiguous', 'none', 'via_applicant_record']),
  nodeId: z.string().nullable(),
  matchedName: z.string().nullable(),
  cin: z.string().nullable(),
  mcaStatus: z.string().nullable(),
  records: z.array(PrRecordSchema),
});
export type PrSubject = z.infer<typeof PrSubjectSchema>;

/** One documented "filed insolvency against" link: debtor owed money to creditor. */
export const PrLinkSchema = z.object({
  creditor: z.string(),
  debtor: z.string(),
  debtorCin: z.string().nullable(),
  debtorStatus: z.string().nullable(),
  date: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  evidenceStatus: z.string(),
});
export type PrLink = z.infer<typeof PrLinkSchema>;

export const PrExposureSchema = z.object({
  customer: PrSubjectSchema,
  /** The customer was declared by the applicant (false = found only in public records). */
  declared: z.boolean(),
  /** Public record of the applicant filing insolvency against this customer, if any. */
  applicantLink: PrLinkSchema.nullable(),
  /** The customer's own unpaid receivables: customer → its debtor → … (documented links). */
  chain: z.array(PrLinkSchema),
});
export type PrExposure = z.infer<typeof PrExposureSchema>;

export const PublicRecordsSnapshotSchema = z.object({
  ranAt: isoDate,
  datasetLabel: z.string(),
  datasetBuiltAt: z.string().nullable(),
  graphBuiltAt: z.string(),
  /** Inputs the check used, to detect that the application changed afterwards. */
  inputsKey: z.string(),
  applicant: PrSubjectSchema,
  exposures: z.array(PrExposureSchema),
  customersChecked: z.array(PrSubjectSchema),
});
export type PublicRecordsSnapshot = z.infer<typeof PublicRecordsSnapshotSchema>;

/**
 * Post-disbursement public-records watch: a disbursed loan's borrower checked against the
 * local public-records graph. Each record dated after disbursement becomes an event (and an
 * alert) the first time a check sees it; events are append-only, like notifications sent.
 */
export const WatchEventSchema = z.object({
  /** Stable key: case type, record date and title. */
  key: z.string().min(1),
  record: PrRecordSchema,
  /** When a check first raised it (the notification time). */
  raisedAt: isoDate,
  /** The "as of" date of the check that raised it (replay date in tests). */
  raisedAsOf: z.string(),
});
export type WatchEvent = z.infer<typeof WatchEventSchema>;

export const PublicWatchSchema = z.object({
  id,
  /** Loan in the loan book this watch follows (null when added by hand). */
  loanId: id.nullable(),
  loanRef: z.string().min(1).max(60),
  borrowerName: z.string().min(1).max(200),
  cin: z.string(),
  amountMinor: minor.nullable(),
  /** YYYY-MM-DD; records dated after this raise alerts. */
  disbursedOn: z.string(),
  branchId: id,
  createdAt: isoDate,
  createdBy: z.string(),
  lastCheck: z
    .object({
      checkedAt: isoDate,
      asOf: z.string(),
      datasetBuiltAt: z.string().nullable(),
      subject: PrSubjectSchema,
    })
    .nullable(),
  events: z.array(WatchEventSchema),
  audit: z.array(AuditEntrySchema),
});
export type PublicWatch = z.infer<typeof PublicWatchSchema>;

export const AiAnalysisSnapshotSchema = z.object({
  inputsKey: z.string(),
  omittedDocuments: z.number().int().nonnegative(),
  /** Checked with the shared (zod 3) schema; the web app's zod 4 cannot nest it directly. */
  result: z.custom<AnalyseApplicationResult>(
    (v) => AnalyseApplicationResultSchema.safeParse(v).success,
  ),
});
export type AiAnalysisSnapshot = z.infer<typeof AiAnalysisSnapshotSchema>;

/** A draft question an officer approved (possibly edited) for a request for information. */
export const ApprovedQuestionSchema = z.object({ text: z.string(), by: z.string(), at: isoDate });
export type ApprovedQuestion = z.infer<typeof ApprovedQuestionSchema>;

/** What one citation pointed at when the investigation ran. */
export const InvestigationEvidenceSchema = z.object({ label: z.string(), detail: z.string() });
export type InvestigationEvidence = z.infer<typeof InvestigationEvidenceSchema>;

export const AiInvestigationSnapshotSchema = z.object({
  inputsKey: z.string(),
  /** Display text of every cited item, by citation key (lib/investigation-evidence.ts). */
  evidence: z.record(z.string(), InvestigationEvidenceSchema),
  /** False when the public-records index could not be loaded: the shortlists were empty. */
  publicRecordsLoaded: z.boolean(),
  /** Checked with the shared (zod 3) schema; the web app's zod 4 cannot nest it directly. */
  result: z.custom<InvestigateApplicationResult>(
    (v) => InvestigateApplicationResultSchema.safeParse(v).success,
  ),
  /** Approved draft questions by question id. */
  approved: z.record(z.string(), ApprovedQuestionSchema).default({}),
});
export type AiInvestigationSnapshot = z.infer<typeof AiInvestigationSnapshotSchema>;

export const ApplicationSchema = z.object({
  id,
  borrowerId: id.nullable(),
  borrowerType: BorrowerTypeSchema,
  branchId: id,
  status: ApplicationStatusSchema,
  createdAt: isoDate,
  submittedAt: isoDate.nullable(),
  updatedAt: isoDate,
  createdBy: z.string(),
  step: z.number().int().min(1).max(4),
  data: ApplicationDataSchema,
  unverifiedSections: z.array(ApplicationSectionSchema),
  documentIds: z.array(id),
  notes: z.array(NoteSchema),
  audit: z.array(AuditEntrySchema),
  checksRunAt: isoDate.nullable(),
  findingStates: z.record(z.string(), FindingStateSchema),
  publicRecords: PublicRecordsSnapshotSchema.nullable(),
  /** The last AI analysis (analyseApplication) and the inputs it was made from; null until run. */
  aiAnalysis: AiAnalysisSnapshotSchema.nullable().default(null),
  /** The last AI investigation (investigateApplication); null until run. */
  aiInvestigation: AiInvestigationSnapshotSchema.nullable().default(null),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const LanguageSchema = z.enum(['mr', 'en', 'hi', 'mixed', 'other']);
export type Language = z.infer<typeof LanguageSchema>;

export const ProcessingStateSchema = z.enum([
  'queued',
  'uploading',
  'processing',
  'needs_review',
  'completed',
  'failed',
]);
export type ProcessingState = z.infer<typeof ProcessingStateSchema>;

export const FieldStateSchema = z.enum(['unreviewed', 'confirmed', 'corrected', 'unclear']);
export type FieldState = z.infer<typeof FieldStateSchema>;

export const RegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Region = z.infer<typeof RegionSchema>;

export const ExtractedFieldSchema = z.object({
  id,
  key: z.string(),
  label: z.string(),
  /** Value as machine-extracted (or null for manual entry). Never overwritten. */
  machineValue: z.string().nullable(),
  /** Current reviewed value. Equals machineValue until a human corrects it. */
  value: z.string(),
  origin: z.enum(['simulated', 'manual']),
  page: z.number().int().nonnegative(),
  region: RegionSchema.nullable(),
  quality: z.enum(['clear', 'low', 'handwritten', 'unreadable', 'not_applicable']),
  state: FieldStateSchema,
  reviewedBy: z.string().nullable(),
  reviewedAt: isoDate.nullable(),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const DocumentPageSchema = z.object({
  index: z.number().int().nonnegative(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});
export type DocumentPage = z.infer<typeof DocumentPageSchema>;

export const DocumentSchema = z.object({
  id,
  applicationId: id.nullable(),
  borrowerId: id.nullable(),
  filename: z.string(),
  docType: z.string().nullable(),
  language: LanguageSchema.nullable(),
  source: z.enum(['demo', 'upload', 'camera']),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pages: z.array(DocumentPageSchema),
  uploadedBy: z.string(),
  uploadedAt: isoDate,
  processing: ProcessingStateSchema,
  failureReason: z.string().nullable(),
  qualityWarnings: z.array(z.string()),
  /** Key into the synthetic sample registry (demo docs only). */
  sampleId: z.string().nullable(),
  fields: z.array(ExtractedFieldSchema),
  audit: z.array(AuditEntrySchema),
});
export type FtDocument = z.infer<typeof DocumentSchema>;

export const EntityKindSchema = z.enum([
  'individual',
  'company',
  'account',
  'loan',
  'document',
  'proceeding',
  'counterparty',
]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const EntitySchema = z.object({
  id,
  kind: EntityKindSchema,
  name: z.string(),
  subtitle: z.string(),
  /** For accounts: owning entity. */
  ownerId: id.nullable(),
  borrowerId: id.nullable(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const RelationshipTypeSchema = z.enum([
  'director_of',
  'owner_of',
  'borrower_for',
  'guarantor_for',
  'shared_identifier',
  'same_proceeding',
  'shares_address',
  'account_of',
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const LinkStatusSchema = z.enum(['verified', 'user_provided', 'inferred']);
export type LinkStatus = z.infer<typeof LinkStatusSchema>;

export const RelationshipSchema = z.object({
  id,
  from: id,
  to: id,
  type: RelationshipTypeSchema,
  status: LinkStatusSchema,
  source: z.string(),
  observedAt: isoDate,
  evidence: z.string(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const LoanSchema = z.object({
  id,
  applicationId: id.nullable(),
  borrowerId: id,
  product: LoanProductSchema,
  amountMinor: minor,
  disbursedAt: isoDate,
  purpose: z.string(),
  monitoringDays: z.number().int().positive(),
  accountEntityId: id,
  dataSource: z.string(),
  lastUpdated: isoDate,
  branchId: id,
});
export type Loan = z.infer<typeof LoanSchema>;

export const TransactionTypeSchema = z.enum([
  'disbursement',
  'neft',
  'rtgs',
  'imps',
  'upi',
  'cheque',
  'cash_withdrawal',
  'repayment',
]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const TransactionSchema = z.object({
  id,
  loanId: id.nullable(),
  at: isoDate,
  fromId: id,
  toId: id,
  amountMinor: minor.positive(),
  type: TransactionTypeSchema,
  reference: z.string(),
  source: z.enum(['demo', 'import']),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const AlertStatusSchema = z.enum([
  'new',
  'in_review',
  'escalated',
  'resolved',
  'false_positive',
]);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const AlertStateSchema = z.object({
  status: AlertStatusSchema,
  assignee: z.string().nullable(),
  resolutionReason: z.string().nullable(),
  notes: z.array(NoteSchema),
  audit: z.array(AuditEntrySchema),
});
export type AlertState = z.infer<typeof AlertStateSchema>;

export const PrioritySchema = z.enum(['routine', 'needs_attention', 'urgent']);
export type Priority = z.infer<typeof PrioritySchema>;

export const CaseStatusSchema = z.enum([
  'new',
  'triage',
  'in_review',
  'information_requested',
  'escalated',
  'resolved',
  'closed',
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const EvidenceSchema = z.object({
  id,
  sourceName: z.string(),
  sourceType: z.enum([
    'uploaded_document',
    'transaction_record',
    'public_filing',
    'judgment_order',
    'internal_record',
  ]),
  reference: z.string(),
  collectedAt: isoDate,
  excerpt: z.string(),
  status: z.enum(['verified_source', 'user_provided', 'unverified', 'contradicted']),
  link: z.string().nullable(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const CaseSchema = z.object({
  id,
  title: z.string(),
  summary: z.string(),
  priority: PrioritySchema,
  status: CaseStatusSchema,
  owner: z.string(),
  branchId: id,
  openedAt: isoDate,
  updatedAt: isoDate,
  source: z.enum(['pre_disbursement', 'monitoring', 'referral']),
  borrowerIds: z.array(id),
  entityIds: z.array(id),
  loanIds: z.array(id),
  applicationIds: z.array(id),
  alertIds: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
  notes: z.array(NoteSchema),
  checklist: z.array(z.object({ id, text: z.string(), done: z.boolean() })),
  audit: z.array(AuditEntrySchema),
  outcome: z.string().nullable(),
});
export type Case = z.infer<typeof CaseSchema>;

export const MonitoringConfigSchema = z.object({
  version: z.number().int().positive(),
  effectiveAt: isoDate,
  updatedBy: z.string(),
  rapidOnwardHours: z.number().int().positive(),
  rapidOnwardPercent: z.number().int().min(1).max(100),
  repeatedCounterpartyMinLoans: z.number().int().min(2),
  repeatedCounterpartyWindowDays: z.number().int().positive(),
  repeatedCounterpartyMinAmountMinor: minor.positive(),
  circularWindowDays: z.number().int().positive(),
  circularMinReturnPercent: z.number().int().min(1).max(100),
  cashReferenceMinor: minor.positive(),
  cashNearPercent: z.number().int().min(50).max(99),
  cashMinCount: z.number().int().min(2),
  cashWindowDays: z.number().int().positive(),
  incomeMismatchRatio: z.number().min(1),
  landAreaTolerancePercent: z.number().min(0).max(50),
});
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

export const SettingsSchema = z.object({
  profile: z.object({
    name: z.string(),
    employeeId: z.string(),
    email: z.string(),
    role: RoleSchema,
    branchId: id,
  }),
  preferences: z.object({
    language: z.enum(['en', 'mr']),
    theme: z.enum(['light', 'dark', 'system']),
    dateFormat: z.enum(['dd-mmm-yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd']),
    timezone: z.string(),
    density: z.enum(['comfortable', 'compact']),
    notifyNewAlerts: z.boolean(),
    notifyCaseUpdates: z.boolean(),
    notifyWeeklyDigest: z.boolean(),
    developerMode: z.boolean(),
  }),
  monitoring: MonitoringConfigSchema,
  checklists: z.record(LoanProductSchema, z.array(z.string())),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DbSchema = z.object({
  version: z.literal(1),
  generatedAt: isoDate,
  bankName: z.string(),
  branches: z.array(BranchSchema),
  borrowers: z.array(BorrowerSchema),
  applications: z.array(ApplicationSchema),
  documents: z.array(DocumentSchema),
  entities: z.array(EntitySchema),
  relationships: z.array(RelationshipSchema),
  loans: z.array(LoanSchema),
  transactions: z.array(TransactionSchema),
  alertStates: z.record(z.string(), AlertStateSchema),
  cases: z.array(CaseSchema),
  settings: SettingsSchema,
  readAlertIds: z.array(z.string()),
  publicWatches: z.array(PublicWatchSchema),
  counters: z.object({
    application: z.number().int(),
    document: z.number().int(),
    case: z.number().int(),
  }),
});
export type Db = z.infer<typeof DbSchema>;
