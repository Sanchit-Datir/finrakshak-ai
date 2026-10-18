/** Investigation cases and their evidence. */

import { z } from 'zod';
import { AuditEntrySchema, NoteSchema, PrioritySchema, id, isoDate } from './primitives.js';

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
