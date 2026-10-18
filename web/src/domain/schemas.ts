/**
 * Domain model for the FinRakshak AI prototype. Every persisted value is parsed
 * through these schemas when read back from browser storage (CLAUDE.md: parse,
 * don't cast). Money is integer minor units (paise) — see B-01.
 *
 * One module per aggregate in `./schemas/`; `Db` (`./schemas/db.ts`) is the root.
 */

export {
  AuditEntrySchema,
  BranchSchema,
  NoteSchema,
  PrioritySchema,
  RoleSchema,
} from './schemas/primitives.js';

export type { AuditEntry, Branch, Note, Priority, Role } from './schemas/primitives.js';

export { BorrowerSchema, BorrowerTypeSchema } from './schemas/borrowers.js';

export type { Borrower, BorrowerType } from './schemas/borrowers.js';

export {
  AiAnalysisSnapshotSchema,
  AiInvestigationSnapshotSchema,
  ApplicationDataSchema,
  ApplicationSchema,
  ApplicationSectionSchema,
  ApplicationStatusSchema,
  ApprovedQuestionSchema,
  FindingStateSchema,
  FindingStatusSchema,
  InvestigationEvidenceSchema,
  LandUnitSchema,
  LoanProductSchema,
  MAX_TRADE_CUSTOMERS,
  TradeCustomerSchema,
} from './schemas/applications.js';

export type {
  AiAnalysisSnapshot,
  AiInvestigationSnapshot,
  Application,
  ApplicationData,
  ApplicationSection,
  ApplicationStatus,
  ApprovedQuestion,
  FindingState,
  FindingStatus,
  InvestigationEvidence,
  LandUnit,
  LoanProduct,
  TradeCustomer,
} from './schemas/applications.js';

export {
  PrExposureSchema,
  PrLinkSchema,
  PrRecordSchema,
  PrSubjectSchema,
  PublicRecordsSnapshotSchema,
  PublicWatchSchema,
  WatchEventSchema,
} from './schemas/public-records.js';

export type {
  PrExposure,
  PrLink,
  PrRecord,
  PrSubject,
  PublicRecordsSnapshot,
  PublicWatch,
  WatchEvent,
} from './schemas/public-records.js';

export {
  DocumentPageSchema,
  DocumentSchema,
  ExtractedFieldSchema,
  FieldStateSchema,
  LanguageSchema,
  ProcessingStateSchema,
  RegionSchema,
} from './schemas/documents.js';

export type {
  DocumentPage,
  ExtractedField,
  FieldState,
  FtDocument,
  Language,
  ProcessingState,
  Region,
} from './schemas/documents.js';

export {
  EntityKindSchema,
  EntitySchema,
  LinkStatusSchema,
  RelationshipSchema,
  RelationshipTypeSchema,
} from './schemas/entities.js';

export type {
  Entity,
  EntityKind,
  LinkStatus,
  Relationship,
  RelationshipType,
} from './schemas/entities.js';

export {
  AlertStateSchema,
  AlertStatusSchema,
  LoanSchema,
  TransactionSchema,
  TransactionTypeSchema,
} from './schemas/loans.js';

export type {
  AlertState,
  AlertStatus,
  Loan,
  Transaction,
  TransactionType,
} from './schemas/loans.js';

export { CaseSchema, CaseStatusSchema, EvidenceSchema } from './schemas/cases.js';

export type { Case, CaseStatus, Evidence } from './schemas/cases.js';

export { DbSchema, MonitoringConfigSchema, SettingsSchema } from './schemas/db.js';

export type { Db, MonitoringConfig, Settings } from './schemas/db.js';
