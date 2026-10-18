import {
  ASSIST_LIMITS as L,
  type AssistFact,
  type AssistFactKind,
  type AssistInput,
} from '@finrakshak-ai/shared';
import { PRIORITY_LABEL, TXN_TYPE_LABEL } from '../../domain/labels.js';
import type { Db, Transaction } from '../../domain/schemas.js';
import type { Finding } from '../checks.js';
import { formatDate, formatMoney, maskIdentifier } from '../format.js';

/** One record turned into numbered facts for the copilot, plus where each fact opens in the app. */
export interface ContextPack {
  subject: AssistInput['subject'];
  facts: AssistFact[];
  /** Fact ref → in-app link for its "Open" button. Stays in the browser; never sent. */
  links: Record<string, string>;
}

const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const LONG_NUMBER = /\b\d{9,18}\b/g;

/**
 * Masks identifiers a record's text might carry (PAN, Aadhaar, account and phone numbers) before
 * anything leaves the browser (B-16, B-64). Amounts are written with separators, so they stay.
 */
export function scrub(text: string): string {
  return text
    .replace(PAN, (m) => `XXXXX${m.slice(5, 9)}X`)
    .replace(LONG_NUMBER, (m) => maskIdentifier(m));
}

const clip = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max);

export interface PackBuilder {
  /** Adds a fact and returns its ref, or null once the pack is full. */
  add: (
    prefix: string,
    kind: AssistFactKind,
    label: string,
    text: string,
    href?: string,
  ) => string | null;
  done: (subject: AssistInput['subject']) => ContextPack;
}

export function packBuilder(): PackBuilder {
  const facts: AssistFact[] = [];
  const links: Record<string, string> = {};
  const counters = new Map<string, number>();
  return {
    add: (prefix, kind, label, text, href) => {
      if (facts.length >= L.maxFacts) return null;
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      const ref = `${prefix}${String(n)}`;
      facts.push({
        ref,
        kind,
        label: clip(scrub(label), L.maxLabelChars) || kind,
        text: clip(scrub(text), L.maxFactChars),
      });
      if (href !== undefined) links[ref] = href;
      return ref;
    },
    done: (subject) => ({
      subject: { kind: subject.kind, title: clip(scrub(subject.title), L.maxTitleChars) },
      facts,
      links,
    }),
  };
}

/** A check finding with its harmless explanation and up to two checks to do next. */
export function addFinding(b: PackBuilder, f: Finding, href: string): void {
  const benign = f.benign[0];
  const ref = b.add(
    'F',
    'finding',
    f.title,
    `${PRIORITY_LABEL[f.priority]}. ${f.observed} Why it matters: ${f.whyItMatters}${
      benign === undefined ? '' : ` Possible harmless reason: ${benign}`
    }`,
    href,
  );
  if (ref === null) return;
  for (const step of f.steps.slice(0, 2)) b.add('K', 'step', `Check for ${ref}`, step, href);
}

export function entityName(db: Db, id: string): string {
  return db.entities.find((e) => e.id === id)?.name ?? 'an unnamed account';
}

export function addTransaction(b: PackBuilder, db: Db, t: Transaction, href: string): void {
  b.add(
    'T',
    'transaction',
    formatDate(t.at),
    `${TXN_TYPE_LABEL[t.type]} of ${formatMoney(t.amountMinor)} from ${entityName(db, t.fromId)} to ${entityName(db, t.toId)}${t.reference === '' ? '' : ` (reference ${t.reference})`}`,
    href,
  );
}
