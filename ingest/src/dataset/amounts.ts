import type { Money, SourceId } from '@finrakshak-ai/shared';
import { excerptAround, findAmounts, findCins, findCompanyNames } from '../extract/patterns.js';

export interface TypedAmount {
  readonly kind: 'penalty' | 'attachment' | 'alleged_loss_or_proceeds' | 'claim_or_debt';
  readonly money: Money;
  readonly excerpt: string;
}

const KINDS: readonly (readonly [TypedAmount['kind'], RegExp])[] = [
  ['penalty', /penalt|fine of|disgorg/i],
  ['attachment', /attach|seiz|froze|freez|confiscat/i],
  [
    'alleged_loss_or_proceeds',
    /proceeds of crime|wrongful loss|defraud|cheat|divert|siphon|fraud/i,
  ],
  ['claim_or_debt', /claim|default|outstanding|debt/i],
];

const MAX_AMOUNTS = 12;
/** Below ₹1,000 is almost always a section number or fee, not a material amount. */
const MIN_MINOR = 100_000;

/** Amounts whose surrounding words say what they are; unlabeled amounts are ignored. */
export function typedAmounts(text: string): TypedAmount[] {
  const out: TypedAmount[] = [];
  const seen = new Set<string>();
  for (const a of findAmounts(text)) {
    const context = text.slice(Math.max(0, a.index - 140), a.index + 60);
    const kind = KINDS.find(([, re]) => re.test(context))?.[0];
    const key = `${kind ?? ''}|${a.money.minor}`;
    if (!kind || seen.has(key) || a.money.minor < MIN_MINOR) continue;
    seen.add(key);
    out.push({ kind, money: a.money, excerpt: excerptAround(text, a.index, 260) });
    if (out.length >= MAX_AMOUNTS) break;
  }
  return out;
}

export interface CinBinding {
  readonly name: string;
  readonly cin: string;
  readonly excerpt: string;
}

/**
 * Binds a CIN to the company named closest before it (within 300 chars). For
 * IBBI announcements, a single CIN in the form is bound to the corporate debtor.
 */
export function bindCins(
  sourceId: SourceId,
  text: string,
  debtor: string | undefined,
): CinBinding[] {
  const cins = findCins(text);
  if (sourceId === 'ibbi' && debtor) {
    const unique = [...new Set(cins.map((c) => c.cin))];
    const first = cins[0];
    return unique.length === 1 && unique[0] && first
      ? [{ name: debtor, cin: unique[0], excerpt: excerptAround(text, first.index) }]
      : [];
  }
  const names = findCompanyNames(text);
  const out: CinBinding[] = [];
  for (const c of cins) {
    const before = names.filter((n) => n.index < c.index && c.index - n.index < 300).at(-1);
    if (before) out.push({ name: before.name, cin: c.cin, excerpt: excerptAround(text, c.index) });
  }
  return out;
}
