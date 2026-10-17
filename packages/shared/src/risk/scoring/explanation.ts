import { z } from 'zod';
import { UtcTimestampSchema } from '../../evidence/documents.js';
import { violatesWording } from '../wording.js';

/**
 * The risk explainer's output (docs/plans/RISK_EXPLAINER_PLAN.md): one plain sentence that words the
 * recorded reasons of an alert. It sits beside the alert, never inside it, because an alert is created
 * once and never rewritten (B-57); the templated `change_text` stays the record. The sentence is a
 * convenience, not evidence (B-62): it is always shown with its label and the reasons under it.
 */

export const RISK_EXPLANATIONS_COLLECTION = 'synthRiskExplanations';

/** Shown above every AI sentence in the app (CLAUDE.md: never present AI output unlabelled). */
export const AI_EXPLANATION_LABEL = 'AI-written summary of the recorded reasons';

export const EXPLANATION_MAX_CHARS = 400;
export const EXPLANATION_MAX_SENTENCES = 2;

const id = z.string().min(1).max(200);

export const RiskExplanationDocSchema = z.object({
  /** Same id as the alert it explains: one explanation per alert, created once (B-24, B-57). */
  alert_id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  loan_id: id,
  branch_id: id,
  run_id: id,
  text: z
    .string()
    .min(1)
    .max(EXPLANATION_MAX_CHARS)
    .refine((t) => !violatesWording(t), 'uses verdict words'),
  /** The model that wrote it; a mock or templated sentence is never stored as an AI explanation. */
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  /** sha256 of the structured input the model saw (no prompt text is stored). */
  input_hash: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: UtcTimestampSchema,
  synthetic: z.literal(true),
});
export type RiskExplanationDoc = z.infer<typeof RiskExplanationDocSchema>;

/** What the app receives for an alert (no input hash). */
export const RiskExplanationViewSchema = RiskExplanationDocSchema.omit({ input_hash: true });
export type RiskExplanationView = z.infer<typeof RiskExplanationViewSchema>;
