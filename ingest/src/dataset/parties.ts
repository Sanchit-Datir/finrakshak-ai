import type { ListingItem } from '@finrakshak-ai/shared';
import { findCompanyNames } from '../extract/patterns.js';
import { looksLikeOrganisation } from '../resolve/names.js';

export type MentionOrigin = 'listing_field' | 'title' | 'text';

export interface OrgMention {
  readonly name: string;
  readonly origin: MentionOrigin;
  readonly role: 'subject' | 'insolvency_applicant' | 'audit_firm' | 'mentioned';
  readonly excerpt: string;
}

export interface PersonMention {
  readonly name: string;
  readonly role: 'insolvency_professional' | 'audit_engagement_partner';
  readonly excerpt: string;
}

export interface Parties {
  readonly orgs: OrgMention[];
  readonly persons: PersonMention[];
}

const MAX_TEXT_ORGS = 25;

const CO_OP = /co-?operative|sahakari|urban bank|nagrik|janata|mercantile/i;

/** Co-operative bank names repeat across towns ("The Urban Co-operative Bank Ltd."); keep the town. */
function withTown(name: string, title: string): string {
  const index = title.indexOf(name);
  if (!CO_OP.test(name) || index < 0) return name;
  const after = title.slice(index + name.length, index + name.length + 60);
  const town = /^\.?,?\s*([A-Z][A-Za-z.\- ]{2,30}?)(?:,|\(|$| - | – )/.exec(after)?.[1]?.trim();
  return town ? `${name}, ${town}` : name;
}

function fromTitle(item: ListingItem): OrgMention[] {
  return findCompanyNames(item.title).map((m) => ({
    name: withTown(m.name, item.title),
    origin: 'title',
    role: 'subject',
    excerpt: item.title,
  }));
}

function fromText(text: string, limit = MAX_TEXT_ORGS): OrgMention[] {
  const seen = new Set<string>();
  const out: OrgMention[] = [];
  for (const m of findCompanyNames(text)) {
    if (seen.has(m.name) || out.length >= limit) continue;
    seen.add(m.name);
    out.push({
      name: m.name,
      origin: 'text',
      role: 'mentioned',
      excerpt: text.slice(Math.max(0, m.index - 100), m.index + 140),
    });
  }
  return out;
}

function ibbiParties(item: ListingItem): Parties {
  const f = item.fields;
  const debtor = f['corporate_debtor'] ?? '';
  const applicant = f['applicant'] ?? '';
  const ip = f['insolvency_professional'] ?? '';
  const excerpt = `${item.title} | applicant: ${applicant} | IP: ${ip}`;
  const orgs: OrgMention[] = [{ name: debtor, origin: 'listing_field', role: 'subject', excerpt }];
  if (
    applicant &&
    looksLikeOrganisation(applicant) &&
    applicant.toUpperCase() !== debtor.toUpperCase()
  ) {
    orgs.push({ name: applicant, origin: 'listing_field', role: 'insolvency_applicant', excerpt });
  }
  const persons: PersonMention[] = ip
    ? [{ name: ip, role: 'insolvency_professional', excerpt }]
    : [];
  return { orgs, persons };
}

const PARTNER_RE =
  /against\s+((?:CA\.?\s+[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,4}(?:\s*,\s*|\s+and\s+)?)+)/;

const AUDIT_FIRM = /\bLLP\b|&\s*Co\b|&\s*Associates|\band\s+Co\b|Chartered Accountants/i;

function nfraParties(item: ListingItem, text: string): Parties {
  // NFRA titles name both the audited company and, sometimes, the audit firm.
  const orgs = fromTitle(item).map((o) =>
    AUDIT_FIRM.test(o.name) ? { ...o, role: 'audit_firm' as const } : o,
  );
  const persons: PersonMention[] = [];
  const partners = PARTNER_RE.exec(item.title)?.[1] ?? '';
  for (const p of partners.split(/\s*,\s*|\s+and\s+/)) {
    const name = p
      .replace(/^CA\.?\s+/, '')
      .replace(/\s+(For|for)\s+.*$/, '')
      .trim();
    if (name.length > 3)
      persons.push({ name, role: 'audit_engagement_partner', excerpt: item.title });
  }
  const firmMatch =
    /M\/s\.?\s*([A-Z][A-Za-z0-9&.,' ]{2,80}?(?:LLP|& Co\.?|& Associates|and Co\.?))/.exec(
      text.slice(0, 6_000),
    );
  if (firmMatch?.[1]) {
    orgs.push({
      name: firmMatch[1].trim(),
      origin: 'text',
      role: 'audit_firm',
      excerpt: firmMatch[0],
    });
  }
  return { orgs, persons };
}

/** Organisations and professionals named by a listing item (and, where useful, its text). */
export function extractParties(item: ListingItem, text: string): Parties {
  switch (item.source_id) {
    case 'ibbi':
      return ibbiParties(item);
    case 'nfra':
      return nfraParties(item, text);
    case 'sebi':
      return { orgs: [...fromTitle(item), ...fromText(text.slice(0, 4_000), 10)], persons: [] };
    case 'ed':
      return { orgs: [...fromTitle(item), ...fromText(text.slice(0, 8_000), 15)], persons: [] };
    case 'rbi':
    case 'sfio':
      return { orgs: [...fromTitle(item), ...fromText(text.slice(0, 40_000))], persons: [] };
    case 'mca_ogd':
    case 'nse_bse':
    case 'nclt':
    case 'ecourts_sci':
      return { orgs: fromTitle(item), persons: [] };
  }
}
