import { violatesWording, type StepMatcher } from '@fund-tracker/shared';
import { numbersOf, unknownNumbers } from '../ai/outputChecks.js';
import type { Candidate } from './candidates.js';

/** The words of a pattern: the only part of a proposal the model may write (PATTERN_CONTRACT.md, 5). */
export interface PatternWording {
  readonly name: string;
  readonly description: string;
  readonly benign_explanations: readonly string[];
}

const stepWords = (s: StepMatcher): string =>
  s.by === 'case_type'
    ? `a ${s.value.replace(/_/g, ' ')} record`
    : s.by === 'kind'
      ? `an ${s.value} record`
      : `a record from ${s.value.toUpperCase()}`;

/** The numbers a proposal may repeat: everything the code computed for this candidate. */
export const allowedNumbers = (c: Candidate): number[] =>
  numbersOf({
    definition: c.definition,
    stats: c.stats,
    support_count: c.stats.support_case_ids.length,
    steps: c.definition.steps.length,
  });

/**
 * Code-written wording: used for the mock, when the model fails or runs out of budget, and when it
 * worded a candidate badly. It states the sequence and the numbers, and the one benign reading that
 * always holds for hand-picked defaulters (B-59).
 */
export function templatedWording(c: Candidate): PatternWording {
  const steps = c.definition.steps.map(stepWords);
  const cases = c.stats.support_case_ids.length;
  const name = steps.join(', then ').replace(/^a |^an /, '');
  return {
    name: `${name.charAt(0).toUpperCase()}${name.slice(1)}`.slice(0, 80),
    description:
      `In ${cases} seed cases ${steps.join(', then ')} came in this order, each within ${c.definition.max_gap_months} months of the one before, the last at least ${c.definition.min_lead_months} months after the step before it.`.slice(
        0,
        400,
      ),
    benign_explanations: [
      'The seed cases were chosen because they defaulted, so the same records also appear for companies that recovered or repaid in full.',
    ],
  };
}

/** Why model wording cannot be used, or null: verdict words or a number the code did not compute. */
export function wordingProblem(w: PatternWording, c: Candidate): string | null {
  const texts = [w.name, w.description, ...w.benign_explanations];
  if (texts.some(violatesWording)) return 'uses verdict words; describe the records neutrally';
  const invented = unknownNumbers(texts.join(' '), allowedNumbers(c));
  if (invented.length > 0)
    return `uses numbers the code did not compute (${invented.slice(0, 5).join(', ')}); repeat only the candidate's numbers`;
  return null;
}
