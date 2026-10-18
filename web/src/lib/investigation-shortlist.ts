import {
  INVESTIGATION_LIMITS as L,
  type InvestigationCandidate,
  type InvestigationRelated,
} from '@fund-tracker/shared';
import type { GraphNode } from '@fund-tracker/shared';
import { isOrganisation, type LabIndex } from './graph-lab.js';
import {
  cinOf,
  mcaStatusOf,
  namedRecords,
  normalizeCompanyName,
  NOT_GOING_CONCERN,
} from './public-records.js';
import { nameSimilarity } from './text.js';

/**
 * Public-records shortlist for the AI investigator: code, not the model, picks the candidates a party
 * may match, with fuzzy name matching over the published index (docs/AI_INVESTIGATOR.md, B-66). The
 * model may only point at these; a candidate is a possible match until the CIN or address agrees.
 * A record with a different CIN is a different legal entity and is never shortlisted (B-37).
 */

/** Below this name score (0–100) a node is not a candidate. */
export const MIN_NAME_SCORE = 70;
/** Words too common in company names to say anything about identity. */
const COMMON = new Set([
  'PRIVATE',
  'LIMITED',
  'COMPANY',
  'INDIA',
  'AND',
  'THE',
  'OF',
  'LLP',
  'INDUSTRIES',
  'ENTERPRISES',
  'TRADERS',
  'SYNTH',
  'TEST',
]);

interface Entry {
  readonly node: GraphNode;
  readonly tokens: readonly string[];
}

const tokensOf = (name: string): string[] =>
  normalizeCompanyName(name)
    .split(' ')
    .filter((t) => t.length > 1 && !COMMON.has(t));

const entries = new WeakMap<LabIndex, { orgs: Entry[]; people: Entry[] }>();

function entriesOf(ix: LabIndex): { orgs: Entry[]; people: Entry[] } {
  const hit = entries.get(ix);
  if (hit !== undefined) return hit;
  const orgs: Entry[] = [];
  const people: Entry[] = [];
  for (const node of ix.bundle.nodes) {
    if (isOrganisation(node)) orgs.push({ node, tokens: tokensOf(node.label) });
    else if (node.kind === 'person') people.push({ node, tokens: tokensOf(node.label) });
  }
  const out = { orgs, people };
  entries.set(ix, out);
  return out;
}

/** Same word, or a small spelling difference (cheap length and first-letter test first). */
const tokenMatch = (a: string, b: string): boolean =>
  a === b ||
  (b.startsWith(a.slice(0, 1)) && Math.abs(a.length - b.length) <= 2 && a.length > 3 && nameSimilarity(a, b) >= 0.8);

/** Dice similarity of the distinctive words, tolerant of small spelling differences; 0–100. */
export function nameScore(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const used = new Set<number>();
  let common = 0;
  for (const t of a) {
    const i = b.findIndex((u, j) => !used.has(j) && tokenMatch(t, u));
    if (i >= 0) {
      used.add(i);
      common++;
    }
  }
  return Math.round((200 * common) / (a.length + b.length));
}

const PINCODE = /\b(\d{6})\b|India-(\d{6})/;
const pincodeOf = (s: string): string | null => {
  const m = PINCODE.exec(s);
  return m?.[1] ?? m?.[2] ?? null;
};

/** The registered address of a node, if the graph has one. */
function addressOf(ix: LabIndex, id: string): GraphNode | undefined {
  const e = (ix.all.out.get(id) ?? []).find((x) => x.type === 'registered_at' && x.from === id);
  return e === undefined ? undefined : ix.nodes.get(e.to);
}

export interface PartyQuery {
  readonly name: string;
  readonly cin: string;
  /** The party's pincode when known (applicant and business), for the address check. */
  readonly pincode: string | null;
  readonly people: boolean;
}

function candidateOf(ix: LabIndex, q: PartyQuery, node: GraphNode, score: number): InvestigationCandidate {
  const cin = cinOf(node);
  const address = addressOf(ix, node.id)?.label ?? null;
  const theirPin = address === null ? null : pincodeOf(address);
  const inputCin = q.cin.trim().toUpperCase();
  return {
    candidateId: node.id,
    name: node.label.slice(0, L.maxValueChars),
    cin,
    address: address?.slice(0, L.maxValueChars) ?? null,
    status: mcaStatusOf(node)?.slice(0, 120) ?? null,
    nameScore: score,
    cinAgrees: inputCin === '' || cin === null ? null : cin === inputCin,
    addressAgrees: q.pincode === null || theirPin === null ? null : q.pincode === theirPin,
    records: namedRecords(ix, node.id)
      .slice(0, L.maxRecordsPerCandidate)
      .map(({ eventId, record }) => ({
        recordId: eventId,
        kind: record.kind,
        date: record.date?.slice(0, 10) ?? null,
        title: record.title.slice(0, L.maxValueChars),
      })),
  };
}

/** Up to five candidates, best name score first; an exact CIN always makes the list. */
export function shortlist(ix: LabIndex, q: PartyQuery): InvestigationCandidate[] {
  const mine = tokensOf(q.name);
  const inputCin = q.cin.trim().toUpperCase();
  const pool = q.people ? entriesOf(ix).people : entriesOf(ix).orgs;
  const scored = pool
    .map((e) => {
      const cin = cinOf(e.node);
      const sameCin = inputCin !== '' && cin === inputCin;
      return { e, score: nameScore(mine, e.tokens), sameCin, otherCin: inputCin !== '' && cin !== null && !sameCin };
    })
    .filter((s) => !s.otherCin && (s.sameCin || s.score >= MIN_NAME_SCORE))
    .sort((a, b) => Number(b.sameCin) - Number(a.sameCin) || b.score - a.score || b.e.node.degree - a.e.node.degree);
  return scored.slice(0, L.maxCandidatesPerParty).map((s) => candidateOf(ix, q, s.e.node, s.score));
}

const concernOf = (ix: LabIndex, node: GraphNode): string | null => {
  const latest = namedRecords(ix, node.id)[0];
  if (latest !== undefined) return `Named in a ${latest.record.kind} record`.slice(0, L.maxValueChars);
  const status = mcaStatusOf(node);
  return status !== null && NOT_GOING_CONCERN.test(status) ? `MCA status: ${status}` : null;
};

/**
 * Companies registered at the same address as a confident candidate (exact CIN or full name score),
 * troubled ones first. Hub addresses (shared by very many companies) are skipped.
 */
export function publicRelated(ix: LabIndex, candidates: readonly InvestigationCandidate[]): InvestigationRelated[] {
  const out: InvestigationRelated[] = [];
  for (const c of candidates.filter((x) => x.cinAgrees === true || x.nameScore === 100)) {
    const adr = addressOf(ix, c.candidateId);
    if (adr === undefined || adr.hub) continue;
    for (const e of ix.all.out.get(adr.id) ?? []) {
      const other = ix.nodes.get(e.from === adr.id ? e.to : e.from);
      if (e.type !== 'registered_at' || other === undefined || other.id === c.candidateId) continue;
      out.push({
        entityId: other.id,
        name: other.label.slice(0, L.maxValueChars),
        relation: `Registered at the same address as ${c.name}`.slice(0, 120),
        source: 'public_records',
        concern: concernOf(ix, other),
      });
    }
  }
  return out.sort((a, b) => Number(b.concern !== null) - Number(a.concern !== null));
}
