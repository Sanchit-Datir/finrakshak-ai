/** Loan applications: form data, finding review and the AI results stored on them. */

import {
  AnalyseApplicationResultSchema,
  InvestigateApplicationResultSchema,
} from '@finrakshak-ai/shared';
import type { AnalyseApplicationResult, InvestigateApplicationResult } from '@finrakshak-ai/shared';
import { z } from 'zod';
import { AuditEntrySchema, NoteSchema, id, isoDate, minor } from './primitives.js';
import { BorrowerTypeSchema } from './borrowers.js';
import { PublicRecordsSnapshotSchema } from './public-records.js';

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
