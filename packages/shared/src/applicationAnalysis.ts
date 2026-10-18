import { z } from 'zod';

/**
 * AI-assisted analysis of one loan application (`analyseApplication` callable). The browser sends the
 * application's recorded document fields and check findings (identifiers already masked, B-16); the
 * function asks Gemini for grounded facts, plain notes on the findings and a short summary. Every
 * item the model returns is checked by code against what was sent; anything that does not match is
 * dropped and counted. The result is a lead for a reviewer, never a decision (B-58).
 */

export const APPLICATION_ANALYSIS_LIMITS = {
  maxDocuments: 12,
  maxFieldsPerDocument: 30,
  maxFindings: 25,
  maxValueChars: 200,
  maxTextChars: 300,
  maxFacts: 15,
  /** Parse bound: stays wide so results stored before the shorter summary still load. */
  maxSummaryChars: 1_200,
  /** What the function asks for and keeps (owner, 18 Oct 2026: shorter output). */
  summaryChars: 400,
} as const;

const L = APPLICATION_ANALYSIS_LIMITS;
const ref = z.string().min(1).max(80);
const text = (max: number): z.ZodString => z.string().trim().max(max);

export const AnalysisFieldSchema = z.object({
  fieldId: ref,
  label: text(120).min(1),
  value: text(L.maxValueChars),
  /** True when a person confirmed or corrected the value. */
  reviewed: z.boolean(),
});
export type AnalysisField = z.infer<typeof AnalysisFieldSchema>;

export const AnalysisDocumentSchema = z.object({
  docId: ref,
  docType: text(80).min(1),
  fields: z.array(AnalysisFieldSchema).max(L.maxFieldsPerDocument),
});
export type AnalysisDocument = z.infer<typeof AnalysisDocumentSchema>;

export const AnalysisFindingSchema = z.object({
  findingId: ref,
  title: text(L.maxTextChars).min(1),
  priority: z.enum(['routine', 'needs_attention', 'urgent']),
  observed: text(L.maxTextChars),
});
export type AnalysisFinding = z.infer<typeof AnalysisFindingSchema>;

/** The attention score computed by code in the browser; the model explains it and never changes it. */
export const AnalysisAttentionSchema = z.object({
  score: z.number().int().min(0).max(100),
  band: z.enum(['routine', 'needs_attention', 'urgent']),
  /** Findings that contribute most, biggest first. */
  driverIds: z.array(ref).max(3),
});
export type AnalysisAttention = z.infer<typeof AnalysisAttentionSchema>;

export const AnalyseApplicationInputSchema = z.object({
  borrowerType: z.enum([
    'individual',
    'farmer',
    'proprietorship',
    'partnership',
    'private_limited',
    'other',
  ]),
  documents: z.array(AnalysisDocumentSchema).max(L.maxDocuments),
  findings: z.array(AnalysisFindingSchema).max(L.maxFindings),
  /** Null when the checks have not run. */
  attention: AnalysisAttentionSchema.nullable(),
});
export type AnalyseApplicationInput = z.infer<typeof AnalyseApplicationInputSchema>;

export const AnalysisFactSchema = z.object({
  docId: ref,
  fieldId: ref,
  statement: text(L.maxTextChars).min(1),
});
export type AnalysisFact = z.infer<typeof AnalysisFactSchema>;

export const AnalysisFindingNoteSchema = z.object({
  findingId: ref,
  note: text(L.maxTextChars).min(1),
});
export type AnalysisFindingNote = z.infer<typeof AnalysisFindingNoteSchema>;

export const AnalyseApplicationResultSchema = z.object({
  /** True when the free mock answered: nothing was sent to a model. */
  mock: z.boolean(),
  /** Model name, or null for the mock. */
  model: z.string().nullable(),
  analysedAt: z.string().datetime(),
  /** Empty when the model's summary was withheld by the wording check. */
  summary: text(L.maxSummaryChars),
  facts: z.array(AnalysisFactSchema).max(L.maxFacts),
  findingNotes: z.array(AnalysisFindingNoteSchema).max(L.maxFindings),
  /** Model items removed because they did not match the data sent or used disallowed wording. */
  dropped: z.number().int().nonnegative(),
  /** Billed calls left today; null when the mock answered. */
  remainingToday: z.number().int().nonnegative().nullable(),
});
export type AnalyseApplicationResult = z.infer<typeof AnalyseApplicationResultSchema>;
