/** Public-records check results (before disbursement) and the watch on disbursed loans. */

import { z } from 'zod';
import { AuditEntrySchema, id, isoDate, minor } from './primitives.js';

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
