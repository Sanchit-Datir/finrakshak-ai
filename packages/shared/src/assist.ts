import { z } from 'zod';

/**
 * FinRakshak Copilot (`assistRecord` callable). The browser turns one record (an application,
 * borrower, loan, alert, case or the portfolio) into a numbered list of facts, identifiers already
 * masked (B-16, B-64). Gemini answers a task over those facts only, and every statement must cite the
 * facts it relies on. Code then keeps a statement only when its citations exist, every number in it
 * appears in the cited facts and it uses no verdict word (B-58); everything removed is counted and
 * shown. The answer is a draft for a person, never a decision.
 *
 * functions/ cannot install this package at deploy time, so the callable keeps a runtime copy of the
 * input schema and a compile-time check that both stay the same (see analyseApplication.ts).
 */

export const ASSIST_LIMITS = {
  maxFacts: 60,
  maxFactChars: 400,
  maxLabelChars: 120,
  maxTitleChars: 160,
  maxQuestionChars: 400,
  maxStatements: 8,
  maxStatementChars: 500,
  maxRefsPerStatement: 6,
  maxFollowUps: 3,
  maxHeadlineChars: 160,
  maxPromptChars: 24_000,
} as const;

/** What the officer asks for. `ask` is a free question; the others are one-click tasks. */
export const ASSIST_TASKS = [
  'explain',
  'next_steps',
  'draft_request',
  'memo',
  'money_trail',
  'ask',
] as const;
export type AssistTask = (typeof ASSIST_TASKS)[number];

export const ASSIST_SUBJECT_KINDS = [
  'portfolio',
  'application',
  'borrower',
  'loan',
  'alert',
  'case',
] as const;
export type AssistSubjectKind = (typeof ASSIST_SUBJECT_KINDS)[number];

export const ASSIST_FACT_KINDS = [
  'subject',
  'finding',
  'alert',
  'transaction',
  'document',
  'record',
  'evidence',
  'step',
  'metric',
] as const;
export type AssistFactKind = (typeof ASSIST_FACT_KINDS)[number];

const L = ASSIST_LIMITS;
const text = (max: number): z.ZodString => z.string().trim().max(max);
/** Short citation handle such as "S1", "F3" or "T12". */
export const ASSIST_REF = /^[A-Z]{1,2}\d{1,3}$/;

export const AssistFactSchema = z.object({
  ref: z.string().regex(ASSIST_REF),
  kind: z.enum(ASSIST_FACT_KINDS),
  label: text(L.maxLabelChars).min(1),
  text: text(L.maxFactChars),
});
export type AssistFact = z.infer<typeof AssistFactSchema>;

export const AssistInputSchema = z.object({
  task: z.enum(ASSIST_TASKS),
  subject: z.object({
    kind: z.enum(ASSIST_SUBJECT_KINDS),
    title: text(L.maxTitleChars).min(1),
  }),
  /** The officer's own words for `ask`; empty for the one-click tasks. */
  question: text(L.maxQuestionChars),
  facts: z.array(AssistFactSchema).min(1).max(L.maxFacts),
});
export type AssistInput = z.infer<typeof AssistInputSchema>;

export const AssistStatementSchema = z.object({
  text: text(L.maxStatementChars).min(1),
  refs: z.array(z.string().regex(ASSIST_REF)).min(1).max(L.maxRefsPerStatement),
});
export type AssistStatement = z.infer<typeof AssistStatementSchema>;

/** How the code check treated the model's statements; shown to the officer with every answer. */
export const AssistCheckSchema = z.object({
  received: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
  /** No citation, or a citation to a fact that was not sent. */
  droppedUncited: z.number().int().nonnegative(),
  /** A number that does not appear in the cited facts. */
  droppedNumbers: z.number().int().nonnegative(),
  /** A verdict word ("fraud", "guilty", …). */
  droppedWording: z.number().int().nonnegative(),
});
export type AssistCheck = z.infer<typeof AssistCheckSchema>;

export const AssistResultSchema = z.object({
  /** True when no model was called (the server's mock provider). */
  mock: z.boolean(),
  /** Model name, or null when no model was called. */
  model: z.string().nullable(),
  generatedAt: z.string().datetime(),
  headline: text(L.maxHeadlineChars),
  statements: z.array(AssistStatementSchema).max(L.maxStatements),
  followUps: z.array(text(160).min(1)).max(L.maxFollowUps),
  check: AssistCheckSchema,
  /** Billed calls left today; null when no model was called. */
  remainingToday: z.number().int().nonnegative().nullable(),
});
export type AssistResult = z.infer<typeof AssistResultSchema>;
