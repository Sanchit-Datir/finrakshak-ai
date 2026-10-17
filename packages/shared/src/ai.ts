import { z } from 'zod';

/**
 * Result of the `askGemini` callable. Mirrored (as a plain interface) in
 * functions/src/callable/askGemini.ts, because Cloud Build cannot install this workspace package.
 */
export const AskGeminiResultSchema = z.object({
  text: z.string(),
  /** True when the free mock answered instead of a billed model. */
  mock: z.boolean(),
  /** Billed calls left today for this user; null when the mock answered. */
  remainingToday: z.number().int().nonnegative().nullable(),
});
export type AskGeminiResult = z.infer<typeof AskGeminiResultSchema>;

/** Same cap the server enforces; checked in the UI to fail fast. */
export const ASK_GEMINI_MAX_PROMPT_CHARS = 8_000;
