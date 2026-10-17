import { z } from 'zod';
import { IsoDateSchema } from '../evidence/documents.js';

/**
 * The owner's review of the seed cases' timelines (docs/plans/PATTERN_MINER_PLAN.md, "Seed
 * verification"). The timeline links were found by matching aliases in titles and text, which can match
 * the wrong company, so each entry is marked correct, wrong or unsure by a person. The decisions live in a
 * new file (`data/verification/seed_review.json`); the processed data is never changed.
 */

export const REVIEW_VERDICTS = ['correct', 'wrong', 'unsure'] as const;
export const ReviewVerdictSchema = z.enum(REVIEW_VERDICTS);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

export const SEED_REVIEW_STATUSES = ['verified', 'unverified'] as const;
export type SeedReviewStatus = (typeof SEED_REVIEW_STATUSES)[number];

export interface EntryKeyFields {
  readonly document_id: string;
  readonly case_type: string;
  readonly date: string | null;
}

/** Identifies one timeline entry inside a case. The same document linked twice is one entry. */
export const entryKey = (e: EntryKeyFields): string =>
  `${e.document_id}|${e.case_type}|${e.date ?? ''}`;

export const SeedEntryReviewSchema = z.object({
  entry_key: z.string().min(1),
  /** Null = not reviewed yet. */
  verdict: ReviewVerdictSchema.nullable(),
  note: z.string().max(300),
});
export type SeedEntryReview = z.infer<typeof SeedEntryReviewSchema>;

export const SeedCaseReviewSchema = z.object({
  case_id: z.string().regex(/^[a-z0-9_]+$/),
  status: z.enum(SEED_REVIEW_STATUSES),
  reviewed_by: z.string().min(1).max(100),
  reviewed_on: IsoDateSchema,
  entries: z.array(SeedEntryReviewSchema),
});
export type SeedCaseReview = z.infer<typeof SeedCaseReviewSchema>;

export const SeedVerificationFileSchema = z.object({
  version: z.literal(1),
  cases: z.array(SeedCaseReviewSchema),
});
export type SeedVerificationFile = z.infer<typeof SeedVerificationFileSchema>;

/**
 * A case is verified when every entry of its current timeline has a verdict, none is unsure, and at
 * least one is correct. Entries marked wrong are allowed: they are left out of the case. Decisions about
 * entries that are no longer in the timeline are ignored.
 */
export function deriveCaseStatus(
  timelineKeys: readonly string[],
  entries: readonly Pick<SeedEntryReview, 'entry_key' | 'verdict'>[],
): SeedReviewStatus {
  if (timelineKeys.length === 0) return 'unverified';
  const verdicts = new Map(entries.map((e) => [e.entry_key, e.verdict]));
  let correct = 0;
  for (const key of timelineKeys) {
    const verdict = verdicts.get(key) ?? null;
    if (verdict === null || verdict === 'unsure') return 'unverified';
    if (verdict === 'correct') correct++;
  }
  return correct > 0 ? 'verified' : 'unverified';
}

/** Case ids the owner has verified. */
export const verifiedCaseIds = (file: SeedVerificationFile): Set<string> =>
  new Set(file.cases.filter((c) => c.status === 'verified').map((c) => c.case_id));

/** Entry keys the owner marked wrong, per case; the miner leaves these out. */
export function excludedEntryKeys(file: SeedVerificationFile): Map<string, Set<string>> {
  return new Map(
    file.cases.map((c) => [
      c.case_id,
      new Set(c.entries.filter((e) => e.verdict === 'wrong').map((e) => e.entry_key)),
    ]),
  );
}
