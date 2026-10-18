/** Building blocks shared by every aggregate: ids, dates, money, roles, notes, audit, branches, priority. */

import { z } from 'zod';

/**
 * Domain model for the FinRakshak AI prototype. Every persisted value is parsed
 * through these schemas when read back from browser storage (CLAUDE.md: parse,
 * don't cast). Money is integer minor units (paise) — see B-01.
 */

export const id = z.string().min(1);

export const isoDate = z.string().min(1);

export const minor = z.number().int(); // zod int() is limited to the safe-integer range

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

export const PrioritySchema = z.enum(['routine', 'needs_attention', 'urgent']);

export type Priority = z.infer<typeof PrioritySchema>;
