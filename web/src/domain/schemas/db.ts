/** Settings, monitoring thresholds and the root `Db` saved in browser storage. */

import { z } from 'zod';
import { BranchSchema, RoleSchema, id, isoDate, minor } from './primitives.js';
import { ApplicationSchema, LoanProductSchema } from './applications.js';
import { BorrowerSchema } from './borrowers.js';
import { DocumentSchema } from './documents.js';
import { EntitySchema, RelationshipSchema } from './entities.js';
import { AlertStateSchema, LoanSchema, TransactionSchema } from './loans.js';
import { CaseSchema } from './cases.js';
import { PublicWatchSchema } from './public-records.js';

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
