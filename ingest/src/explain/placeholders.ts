import type { RiskAlertDoc } from '@fund-tracker/shared';

/**
 * Names stay out of the prompt (RISK_EXPLAINER_PLAN.md, design 2; B-38): the model sees `{BORROWER}`,
 * `{LOAN}` and `{PARTY_n}` and writes with them; code puts the real words back afterwards. With synthetic
 * data this is a habit; with real data it keeps customer identities away from the model.
 */

export const BORROWER = '{BORROWER}';
export const LOAN = '{LOAN}';
const TOKEN = /\{[A-Z0-9_]+\}/g;

export interface Placeholders {
  /** Subject or loan id → token. */
  readonly byId: ReadonlyMap<string, string>;
  /** Token → the words that replace it in the stored sentence. */
  readonly byToken: ReadonlyMap<string, string>;
}

export function placeholdersFor(alert: RiskAlertDoc): Placeholders {
  const byId = new Map<string, string>([
    [alert.borrower_id, BORROWER],
    [alert.loan_id, LOAN],
  ]);
  const byToken = new Map<string, string>([
    [BORROWER, 'the borrower'],
    [LOAN, 'the loan'],
  ]);
  for (const r of alert.reasons) {
    if (byId.has(r.subject_id)) continue;
    const token = `{PARTY_${byToken.size - 1}}`;
    byId.set(r.subject_id, token);
    byToken.set(token, r.subject_id);
  }
  return { byId, byToken };
}

/** Replaces every known id in `text` with its token, longest id first (so no id hides inside another). */
export function mask(text: string, ph: Placeholders): string {
  const ids = [...ph.byId.keys()].sort((a, b) => b.length - a.length);
  return ids.reduce((out, id) => out.split(id).join(ph.byId.get(id) ?? id), text);
}

/** The tokens a text uses, in order, without repeats. */
export const tokensIn = (text: string): string[] => [...new Set(text.match(TOKEN) ?? [])];

/** Puts the words back; an unknown token is left as it is (the checks reject it before this). */
export const restore = (text: string, ph: Placeholders): string =>
  text.replace(TOKEN, (t) => ph.byToken.get(t) ?? t);
