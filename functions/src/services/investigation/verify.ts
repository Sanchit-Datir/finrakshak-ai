import type {
  Citation,
  InvestigateApplicationInput,
  InvestigationCandidate,
  InvestigationFinding,
  InvestigationParty,
  InvestigationQuestion,
  InvestigationRatio,
  InvestigationRelated,
  InvestigationField,
  RejectionReason,
} from '@fund-tracker/shared';
import { LIMITS, SECTIONS } from './input.js';

/**
 * Code verification of every claim the investigator makes (docs/AI_INVESTIGATOR.md, B-67). A claim is
 * kept only when each citation points at something in the bundle, each quoted value appears in the
 * cited field, each number it writes is in the cited evidence (the model never does arithmetic), it
 * uses no verdict word and states no score. Anything else is rejected with a reason and counted.
 */

/** Verdict words the app never uses (B-58). */
const DISALLOWED = /\b(fraud\w*|scam\w*|guilty|criminal|launder\w*|cheat\w*|forg(?:ed|ery))\b/i;
/** Only code sets a score: "62/100", "62 out of 100", "risk score", "attention score". */
const STATED_SCORE = /\b\d{1,3}\s*(?:\/|out of)\s*100\b|\b(?:risk|attention|credit)\s+score\b/i;
/** Any digit run with any comma grouping (Indian 12,00,000 too) and an optional decimal part. */
const NUMBER = /\d+(?:,\d+)*(?:\.\d+)?/g;

export function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER)].map((m) => Number(m[0].replace(/,/g, '')));
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

interface RecordRef {
  readonly partyId: string;
  readonly candidate: InvestigationCandidate;
}

export interface BundleIndex {
  readonly input: InvestigateApplicationInput;
  readonly fields: ReadonlyMap<string, InvestigationField>;
  readonly ratios: ReadonlyMap<string, InvestigationRatio>;
  readonly parties: ReadonlyMap<string, InvestigationParty>;
  /** Candidate ids and their record ids, each to the party whose shortlist holds it. */
  readonly records: ReadonlyMap<string, RecordRef>;
  readonly entities: ReadonlyMap<string, { partyIds: string[]; related: InvestigationRelated }>;
}

export function indexBundle(input: InvestigateApplicationInput): BundleIndex {
  const records = new Map<string, RecordRef>();
  const entities = new Map<string, { partyIds: string[]; related: InvestigationRelated }>();
  for (const p of input.parties) {
    for (const c of p.candidates) {
      records.set(c.candidateId, { partyId: p.partyId, candidate: c });
      for (const r of c.records) records.set(r.recordId, { partyId: p.partyId, candidate: c });
    }
    for (const r of p.related) {
      const seen = entities.get(r.entityId);
      entities.set(r.entityId, { partyIds: [...(seen?.partyIds ?? []), p.partyId], related: r });
    }
  }
  return {
    input,
    fields: new Map(SECTIONS.flatMap((s) => input.sections[s].map((f) => [f.path, f] as const))),
    ratios: new Map(input.ratios.map((r) => [r.name, r])),
    parties: new Map(input.parties.map((p) => [p.partyId, p])),
    records,
    entities,
  };
}

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: RejectionReason };
const reject = <T>(reason: RejectionReason): Verdict<T> => ({ ok: false, reason });

/** The evidence a citation points at (for the number check), or the reason it is not in the bundle. */
function evidenceOf(ix: BundleIndex, c: Citation): Verdict<unknown> {
  switch (c.type) {
    case 'field': {
      const f = ix.fields.get(c.path);
      if (f === undefined) return reject('unknown_field');
      if (c.quote !== null && (norm(c.quote) === '' || !norm(f.value).includes(norm(c.quote))))
        return reject('quote_mismatch');
      return { ok: true, value: f };
    }
    case 'ratio': {
      const r = ix.ratios.get(c.name);
      return r === undefined ? reject('unknown_ratio') : { ok: true, value: r };
    }
    case 'record': {
      const r = ix.records.get(c.id);
      return r === undefined ? reject('unknown_record') : { ok: true, value: r.candidate };
    }
    case 'entity': {
      const e = ix.entities.get(c.id);
      return e === undefined ? reject('unknown_entity') : { ok: true, value: e.related };
    }
  }
}

/** Checks a text against the cited evidence: wording, scores and numbers. */
export function checkText(text: string, evidence: readonly unknown[]): RejectionReason | null {
  if (DISALLOWED.test(text)) return 'verdict_word';
  if (STATED_SCORE.test(text)) return 'stated_score';
  const known = new Set(numbersIn(JSON.stringify(evidence)));
  return numbersIn(text).every((n) => known.has(n)) ? null : 'unknown_number';
}

function citedEvidence(ix: BundleIndex, citations: readonly Citation[]): Verdict<unknown[]> {
  const out: unknown[] = [];
  for (const c of citations) {
    const e = evidenceOf(ix, c);
    if (!e.ok) return e;
    out.push(e.value);
  }
  return { ok: true, value: out };
}

/** What each kind of finding must cite (B-67). */
function kindRule(
  ix: BundleIndex,
  kind: InvestigationFinding['kind'],
  partyId: string | null,
  cites: readonly Citation[],
): RejectionReason | null {
  const of = <T extends Citation['type']>(t: T): Extract<Citation, { type: T }>[] =>
    cites.filter((c): c is Extract<Citation, { type: T }> => c.type === t);
  switch (kind) {
    case 'public_record_match': {
      const recs = of('record');
      if (partyId === null || recs.length === 0) return 'missing_evidence';
      // Possible matches come only from that party's code-made shortlist.
      return recs.every((r) => ix.records.get(r.id)?.partyId === partyId)
        ? null
        : 'not_in_shortlist';
    }
    case 'related_entity_link': {
      const ents = of('entity').map((e) => ix.entities.get(e.id));
      if (partyId !== null && ents.some((e) => e?.partyIds.includes(partyId) !== true))
        return 'unknown_entity';
      return ents.some((e) => e !== undefined && e.related.concern !== null)
        ? null
        : 'missing_evidence';
    }
    case 'implausible_numbers':
      return of('ratio').length + of('field').length > 0 ? null : 'missing_evidence';
    case 'section_mismatch':
      return of('field').length >= 2 ? null : 'missing_evidence';
  }
}

/** Strong only when the CIN or the address of a cited candidate also agrees (B-37, B-67). */
function matchOf(ix: BundleIndex, cites: readonly Citation[]): 'possible' | 'strong' {
  const strong = cites.some((c) => {
    if (c.type !== 'record') return false;
    const cand = ix.records.get(c.id)?.candidate;
    return cand?.cinAgrees === true || cand?.addressAgrees === true;
  });
  return strong ? 'strong' : 'possible';
}

export type FindingClaim = Omit<InvestigationFinding, 'id' | 'match'>;

export function verifyFinding(
  ix: BundleIndex,
  claim: FindingClaim,
  id: string,
): Verdict<InvestigationFinding> {
  if (claim.statement.length > LIMITS.maxTextChars) return reject('over_limit');
  const party = claim.partyId === null ? undefined : ix.parties.get(claim.partyId);
  if (claim.partyId !== null && party === undefined) return reject('unknown_party');
  const evidence = citedEvidence(ix, claim.citations);
  if (!evidence.ok) return evidence;
  const rule = kindRule(ix, claim.kind, claim.partyId, claim.citations);
  if (rule !== null) return reject(rule);
  const party_ = party === undefined ? [] : [{ name: party.name, cin: party.cin }];
  const text = checkText(claim.statement, [...evidence.value, ...party_]);
  if (text !== null) return reject(text);
  const match = claim.kind === 'public_record_match' ? matchOf(ix, claim.citations) : null;
  // A possible match needs verification: it is never more than Needs attention.
  const priority =
    match === 'possible' && claim.priority === 'urgent' ? 'needs_attention' : claim.priority;
  return { ok: true, value: { ...claim, id, priority, match } };
}

export function verifyQuestion(
  ix: BundleIndex,
  claim: Omit<InvestigationQuestion, 'id'>,
  id: string,
): Verdict<InvestigationQuestion> {
  if (claim.question.length > LIMITS.maxTextChars) return reject('over_limit');
  const gapField = ix.fields.get(claim.gap);
  if (gapField === undefined && !(SECTIONS as readonly string[]).includes(claim.gap))
    return reject('unknown_field');
  const evidence = citedEvidence(ix, claim.citations);
  if (!evidence.ok) return evidence;
  const text = checkText(claim.question, [...evidence.value, gapField ?? null]);
  return text === null ? { ok: true, value: { ...claim, id } } : reject(text);
}

/** The summary is kept or withheld whole; it may repeat only numbers the bundle holds. */
export function verifySummary(ix: BundleIndex, summary: string): RejectionReason | null {
  if (summary.length > LIMITS.maxSummaryChars) return 'over_limit';
  return checkText(summary, [ix.input]);
}
