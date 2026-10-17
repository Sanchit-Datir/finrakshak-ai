import {
  EXPLANATION_MAX_CHARS,
  EXPLANATION_MAX_SENTENCES,
  violatesWording,
  type Reason,
} from '@fund-tracker/shared';
import { numbersOf, unknownNumbers } from '../ai/outputChecks.js';
import { REASON_TOPICS } from './digest.js';
import { tokensIn, type Placeholders } from './placeholders.js';

/**
 * The explainer's output checks (RISK_EXPLAINER_PLAN.md, design 4). Each failure sends the model one
 * error; if it cannot fix it, the alert keeps only its templated text. If the sentence and the reasons
 * ever disagree, the reasons are right.
 */

const SENTENCE_END = /[.!?](?=\s|$)/g;
/** Words that would turn an allegation into a finding (B-36). "not a finding" is allowed. */
const ESTABLISHED = /\b(findings?|found|proven|proved|established|confirmed|admitted)\b/i;
const NEGATED = /\bnot (a |an )?(findings?|proven|proved|established|confirmed)\b/gi;

const sentences = (text: string): number => (text.trim().match(SENTENCE_END) ?? []).length || 1;

function statusProblem(text: string, reasons: readonly Reason[], top: Reason): string | null {
  const any = (s: string): boolean => reasons.some((r) => r.evidence_statuses.some((x) => x === s));
  if (!any('finding') && ESTABLISHED.test(text.replace(NEGATED, '')))
    return 'describes a record as a finding or as proven; keep each evidence status as recorded';
  const topAlleged =
    top.evidence_statuses.includes('allegation') && !top.evidence_statuses.includes('finding');
  if (topAlleged && !/\balleg/i.test(text))
    return 'the top reason is an allegation; say so (for example "an allegation, not a finding")';
  return null;
}

/** Why `text` (still holding placeholders) cannot be used, or null when it passes every check. */
export function explanationProblem(
  text: string,
  digest: Record<string, unknown>,
  ph: Placeholders,
  ranked: readonly Reason[],
): string | null {
  const top = ranked[0];
  if (top === undefined) return 'this alert has no reasons to explain';
  if (text.length > EXPLANATION_MAX_CHARS) return `longer than ${EXPLANATION_MAX_CHARS} characters`;
  if (sentences(text) > EXPLANATION_MAX_SENTENCES)
    return `more than ${EXPLANATION_MAX_SENTENCES} sentences`;
  if (violatesWording(text)) return 'uses verdict words; describe the reasons neutrally';
  if (/https?:\/\//i.test(text)) return 'contains a link';
  const unknown = tokensIn(text).filter((t) => !ph.byToken.has(t));
  if (unknown.length > 0) return `uses placeholders that were not given (${unknown.join(', ')})`;
  // Placeholders carry digits of their own ({PARTY_1}); only the words around them are counted.
  const invented = unknownNumbers(text.replace(/\{[A-Z0-9_]+\}/g, ''), numbersOf(digest));
  if (invented.length > 0)
    return `uses numbers or dates not in the digest (${invented.slice(0, 5).join(', ')})`;
  if (!REASON_TOPICS[top.code].named.test(text))
    return `does not name the top reason (${top.code.replace(/_/g, ' ')})`;
  return statusProblem(text, ranked, top);
}
