/** Disbursed loans, their transactions and the triage state of monitoring alerts. */

import { z } from 'zod';
import { AuditEntrySchema, NoteSchema, id, isoDate, minor } from './primitives.js';
import { LoanProductSchema } from './applications.js';

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
