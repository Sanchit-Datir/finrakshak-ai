import type { InvestigateApplicationInput } from '@finrakshak-ai/shared';
import { z } from 'zod';

/**
 * Runtime copy of InvestigateApplicationInputSchema and INVESTIGATION_LIMITS
 * (packages/shared/src/applicationInvestigation.ts): Cloud Build cannot install the workspace
 * package, so only its types are imported. `InputInSync` fails to compile if the schemas drift apart;
 * the limits are checked against the shared ones in input.test.ts.
 */
export const LIMITS = {
  maxSectionFields: 20,
  maxCustomerFields: 40,
  maxRatios: 12,
  maxParties: 12,
  maxCandidatesPerParty: 5,
  maxRecordsPerCandidate: 5,
  maxRelatedPerParty: 8,
  maxCheckFindings: 25,
  maxValueChars: 200,
  maxTextChars: 300,
  maxCitations: 6,
  maxFindings: 10,
  maxQuestions: 8,
  /** Parse bound: stays wide so results stored before the shorter summary still load. */
  maxSummaryChars: 800,
  /** What the function enforces on new runs (owner, 18 Oct 2026: shorter output). */
  outputSummaryChars: 400,
  outputFindings: 5,
  maxReadCalls: 8,
  maxTurns: 10,
  maxBundleChars: 40_000,
} as const;

const ref = z.string().min(1).max(80);
const text = (max: number): z.ZodString => z.string().trim().max(max);

const Field = z.object({ path: ref, label: text(120).min(1), value: text(LIMITS.maxValueChars) });
const Ratio = z.object({
  name: ref,
  label: text(120).min(1),
  value: text(40).min(1),
  basis: text(LIMITS.maxTextChars),
});
const Record_ = z.object({
  recordId: ref,
  kind: z.enum(['insolvency', 'liquidation', 'enforcement']),
  date: z.string().max(10).nullable(),
  title: text(LIMITS.maxValueChars),
});
const Candidate = z.object({
  candidateId: ref,
  name: text(LIMITS.maxValueChars).min(1),
  cin: z.string().max(30).nullable(),
  address: text(LIMITS.maxValueChars).nullable(),
  status: text(120).nullable(),
  nameScore: z.number().int().min(0).max(100),
  cinAgrees: z.boolean().nullable(),
  addressAgrees: z.boolean().nullable(),
  records: z.array(Record_).max(LIMITS.maxRecordsPerCandidate),
});
const Related = z.object({
  entityId: ref,
  name: text(LIMITS.maxValueChars).min(1),
  relation: text(120).min(1),
  source: z.enum(['workspace', 'public_records']),
  concern: text(LIMITS.maxValueChars).nullable(),
});
const Party = z.object({
  partyId: ref,
  role: z.enum(['applicant', 'business', 'customer']),
  name: text(LIMITS.maxValueChars).min(1),
  cin: z.string().max(30),
  candidates: z.array(Candidate).max(LIMITS.maxCandidatesPerParty),
  related: z.array(Related).max(LIMITS.maxRelatedPerParty),
});
const Finding = z.object({
  findingId: ref,
  title: text(LIMITS.maxTextChars).min(1),
  priority: z.enum(['routine', 'needs_attention', 'urgent']),
  observed: text(LIMITS.maxTextChars),
});
const section = z.array(Field).max(LIMITS.maxSectionFields);

export const InputSchema = z.object({
  borrowerType: z.enum([
    'individual',
    'farmer',
    'proprietorship',
    'partnership',
    'private_limited',
    'other',
  ]),
  sections: z.object({
    applicant: section,
    business: section,
    loan: section,
    collateral: section,
    customers: z.array(Field).max(LIMITS.maxCustomerFields),
  }),
  ratios: z.array(Ratio).max(LIMITS.maxRatios),
  parties: z.array(Party).max(LIMITS.maxParties),
  findings: z.array(Finding).max(LIMITS.maxCheckFindings),
});

type AssertTrue<T extends true> = T;
type Input = z.infer<typeof InputSchema>;
export type InputInSync = AssertTrue<
  Input extends InvestigateApplicationInput
    ? InvestigateApplicationInput extends Input
      ? true
      : false
    : false
>;

export const SECTIONS = ['applicant', 'business', 'loan', 'collateral', 'customers'] as const;
