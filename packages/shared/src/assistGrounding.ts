import {
  ASSIST_LIMITS as L,
  ASSIST_REF,
  type AssistCheck,
  type AssistInput,
  type AssistStatement,
} from './assist.js';

/**
 * The copilot's grounding check (B-66). A runtime copy lives in functions/src/services/assist.ts
 * (Cloud Build cannot install this package); both run the same cases in
 * packages/shared/src/assist-grounding-cases.json.
 */

/** Verdict words the app never uses (B-58). */
export const ASSIST_DISALLOWED = /\b(fraud\w*|scam\w*|guilty|criminal\w*|launder\w*)\b/i;

/** Citation handles written into the text ("[F2]", "T12") are not numbers to check. */
const REF_TOKEN = /\[?\b[A-Z]{1,2}\d{1,3}\b\]?/g;

/** Numbers as written ("₹1,00,000", "95%", "01 Jun") reduced to bare digits so formats compare. */
export function numbersIn(text: string): string[] {
  const raw = text.replace(REF_TOKEN, ' ').match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return raw.map((n) => {
    const plain = n.replace(/,/g, '').replace(/\.0+$/, '');
    return plain.includes('.') ? plain : plain.replace(/^0+(?=\d)/, '');
  });
}

/** What a model (or the demo simulator) proposes, before the check. */
export interface RawAssistReply {
  headline: string;
  statements: { text: string; refs: string[] }[];
  followUps: string[];
}

export interface GroundedAssist {
  headline: string;
  statements: AssistStatement[];
  followUps: string[];
  check: AssistCheck;
}

const clip = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max);
const stripRefs = (s: string): string => s.replace(REF_TOKEN, '').replace(/\s+([.,;:])/g, '$1');

/**
 * Keeps a statement only when it cites facts that were sent, every number in it appears in those
 * facts (or the record's title) and it uses no verdict word. Everything removed is counted.
 */
export function groundAssist(
  input: AssistInput,
  reply: RawAssistReply,
  fallbackHeadline: string,
): GroundedAssist {
  const facts = new Map(input.facts.map((f) => [f.ref, f]));
  const check: AssistCheck = {
    received: reply.statements.length,
    kept: 0,
    droppedUncited: 0,
    droppedNumbers: 0,
    droppedWording: 0,
  };
  const statements: AssistStatement[] = [];
  for (const s of reply.statements) {
    const text = clip(stripRefs(s.text), L.maxStatementChars);
    const refs = [...new Set(s.refs)]
      .filter((r) => ASSIST_REF.test(r) && facts.has(r))
      .slice(0, L.maxRefsPerStatement);
    if (text === '' || refs.length === 0) {
      check.droppedUncited += 1;
      continue;
    }
    if (ASSIST_DISALLOWED.test(text)) {
      check.droppedWording += 1;
      continue;
    }
    const cited = new Set(
      numbersIn(
        [
          input.subject.title,
          ...refs.map((r) => `${facts.get(r)?.label ?? ''} ${facts.get(r)?.text ?? ''}`),
        ].join(' '),
      ),
    );
    if (numbersIn(text).some((n) => !cited.has(n))) {
      check.droppedNumbers += 1;
      continue;
    }
    if (statements.length < L.maxStatements) statements.push({ text, refs });
  }
  check.kept = statements.length;

  const everything = new Set(
    numbersIn([input.subject.title, ...input.facts.map((f) => `${f.label} ${f.text}`)].join(' ')),
  );
  const headline = clip(stripRefs(reply.headline), L.maxHeadlineChars);
  const headlineOk =
    headline !== '' &&
    !ASSIST_DISALLOWED.test(headline) &&
    numbersIn(headline).every((n) => everything.has(n));
  const followUps = reply.followUps
    .map((q) => clip(q, 160))
    .filter((q) => q !== '' && !ASSIST_DISALLOWED.test(q))
    .slice(0, L.maxFollowUps);
  return { headline: headlineOk ? headline : fallbackHeadline, statements, followUps, check };
}
