import { recordKindOf, type GraphEdge, type GraphNode } from '@fund-tracker/shared';
import type {
  ApplicationData,
  PrExposure,
  PrLink,
  PrRecord,
  PrSubject,
  PublicRecordsSnapshot,
} from '../domain/schemas.js';
import {
  fetchIndex,
  GraphLabLoadError,
  indexBundle,
  isOrganisation,
  loadBundleFromUrl,
  type LabIndex,
} from './graph-lab.js';
import { publicRecordsInputsKey } from './public-records-findings.js';

/**
 * Public-records check for an application: matches the applicant and its declared customers
 * against the local public-records graph (data/graph, built from IBBI, MCA, ED, RBI, NFRA,
 * SFIO and SEBI records) and follows documented insolvency links. Pure, except the loader.
 * Matching is exact only (B-37): CIN first, then exact normalised name; never fuzzy.
 */

/** MCA statuses that mean the company is not a going concern. */
export const NOT_GOING_CONCERN = /^(Under CIRP|Under Liquidation|Strike Off|Dissolved.*|Under process of striking off)$/;
/** How far the chain of unpaid dues is followed from a customer. */
export const CHAIN_MAX_DEPTH = 4;
const CIN_PATTERN = /^([LUF]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}|[A-Z]{3}-\d{4})$/;

export function normalizeCompanyName(s: string): string {
  return s
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\bM\/S\b\.?/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\bPVT\b/g, 'PRIVATE')
    .replace(/\bLTD\b/g, 'LIMITED')
    .replace(/\bCO\b/g, 'COMPANY')
    .replace(/\s+/g, ' ')
    .trim();
}

const detailParts = (n: GraphNode): string[] => (n.detail ?? '').split(' · ').filter(Boolean);
const cinOf = (n: GraphNode): string | null => detailParts(n).find((p) => CIN_PATTERN.test(p)) ?? null;
const mcaStatusOf = (n: GraphNode): string | null =>
  detailParts(n).find((p) => !CIN_PATTERN.test(p)) ?? null;
const caseTypeOf = (event: GraphNode): string => detailParts(event)[2] ?? '';

interface Resolver {
  readonly byCin: ReadonlyMap<string, string>;
  readonly byName: ReadonlyMap<string, readonly string[]>;
}

function resolver(ix: LabIndex): Resolver {
  const byCin = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const n of ix.bundle.nodes) {
    if (!isOrganisation(n)) continue;
    const cin = cinOf(n);
    if (cin !== null) byCin.set(cin, n.id);
    const key = normalizeCompanyName(n.label);
    byName.set(key, [...(byName.get(key) ?? []), n.id]);
  }
  return { byCin, byName };
}

function recordsOf(ix: LabIndex, id: string): PrRecord[] {
  const seen = new Set<string>();
  const out: PrRecord[] = [];
  for (const e of ix.all.out.get(id) ?? []) {
    const event = ix.nodes.get(e.to);
    if (e.type !== 'named_in' || e.from !== id || event === undefined || seen.has(event.id)) continue;
    const kind = recordKindOf(caseTypeOf(event));
    if (kind === undefined) continue;
    seen.add(event.id);
    const doc = ix.docs.get(e.document_id ?? event.document_id ?? '');
    out.push({
      kind,
      caseType: caseTypeOf(event),
      date: event.date,
      title: event.label,
      url: doc?.url ?? null,
      evidenceStatus: e.evidence_status,
    });
  }
  return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

function subjectFromNode(
  ix: LabIndex,
  node: GraphNode,
  base: Pick<PrSubject, 'role' | 'inputName' | 'inputCin' | 'match'>,
): PrSubject {
  return {
    ...base,
    nodeId: node.id,
    matchedName: node.label,
    cin: cinOf(node),
    mcaStatus: mcaStatusOf(node),
    records: recordsOf(ix, node.id),
  };
}

function resolveSubject(
  ix: LabIndex,
  r: Resolver,
  role: PrSubject['role'],
  name: string,
  rawCin: string,
): PrSubject {
  const inputCin = rawCin.trim().toUpperCase();
  const base = { role, inputName: name.trim(), inputCin };
  const byCin = inputCin === '' ? undefined : ix.nodes.get(r.byCin.get(inputCin) ?? '');
  if (byCin !== undefined) return subjectFromNode(ix, byCin, { ...base, match: 'cin' });
  // A record with a different CIN is a different legal entity (B-37), never a name match.
  const candidates = (r.byName.get(normalizeCompanyName(name)) ?? [])
    .map((id) => ix.nodes.get(id))
    .filter((n): n is GraphNode => n !== undefined)
    .filter((n) => inputCin === '' || cinOf(n) === null || cinOf(n) === inputCin);
  const [only] = candidates;
  if (candidates.length === 1 && only !== undefined)
    return subjectFromNode(ix, only, { ...base, match: 'exact_name' });
  const match = candidates.length > 1 ? 'ambiguous' : 'none';
  return { ...base, match, nodeId: null, matchedName: null, cin: null, mcaStatus: null, records: [] };
}

/** In insolvency, liquidation, not a going concern, or named in enforcement records. */
export function isDistressed(s: PrSubject): boolean {
  return s.records.length > 0 || NOT_GOING_CONCERN.test(s.mcaStatus ?? '');
}

/** Insolvency applications the company filed (it is the creditor), latest first, one per debtor. */
function filedAgainst(ix: LabIndex, id: string): GraphEdge[] {
  const edges = (ix.all.out.get(id) ?? [])
    .filter((e) => e.type === 'insolvency_applicant_against' && e.from === id)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const byDebtor = new Map<string, GraphEdge>();
  for (const e of edges) if (!byDebtor.has(e.to)) byDebtor.set(e.to, e);
  return [...byDebtor.values()];
}

/** MCA status and the latest IBBI record can disagree (MCA snapshots lag): show both. */
function statusText(mca: string | null, latest: PrRecord | undefined): string | null {
  const source = latest?.caseType.startsWith('ibbi') === true ? 'IBBI' : 'public records';
  const record = latest === undefined ? null : `in ${latest.kind} per ${source}`;
  if (mca === null) return record === null ? null : `In ${latest?.kind ?? ''} per ${source}`;
  if (record === null || NOT_GOING_CONCERN.test(mca)) return mca;
  return `${mca} per MCA; ${record}`;
}

function toLink(ix: LabIndex, e: GraphEdge): PrLink {
  const debtor = ix.nodes.get(e.to);
  const latest = debtor === undefined ? undefined : recordsOf(ix, debtor.id)[0];
  const status = debtor === undefined ? null : mcaStatusOf(debtor);
  const doc = ix.docs.get(e.document_id ?? '');
  return {
    creditor: ix.nodes.get(e.from)?.label ?? e.from,
    debtor: debtor?.label ?? e.to,
    debtorCin: debtor === undefined ? null : cinOf(debtor),
    debtorStatus: statusText(status, latest),
    date: e.date,
    title: doc?.title ?? 'Insolvency announcement',
    url: doc?.url ?? null,
    evidenceStatus: e.evidence_status,
  };
}

/** Customer → the company that owes it money → … following the latest documented filing. */
function cascade(ix: LabIndex, startId: string): PrLink[] {
  const chain: PrLink[] = [];
  const seen = new Set([startId]);
  let at = startId;
  for (let depth = 0; depth < CHAIN_MAX_DEPTH; depth++) {
    const next = filedAgainst(ix, at).find((e) => !seen.has(e.to));
    if (next === undefined) break;
    chain.push(toLink(ix, next));
    seen.add(next.to);
    at = next.to;
  }
  return chain;
}

function exposures(ix: LabIndex, applicant: PrSubject, customers: readonly PrSubject[]): PrExposure[] {
  const filings = applicant.nodeId === null ? [] : filedAgainst(ix, applicant.nodeId);
  const linkTo = (id: string): PrLink | null => {
    const e = filings.find((f) => f.to === id);
    return e === undefined ? null : toLink(ix, e);
  };
  const declared = customers.flatMap((c) =>
    c.nodeId === null || !isDistressed(c)
      ? []
      : [{ customer: c, declared: true, applicantLink: linkTo(c.nodeId), chain: cascade(ix, c.nodeId) }],
  );
  const known = new Set(customers.map((c) => c.nodeId));
  const undeclared = filings.flatMap((e) => {
    const node = ix.nodes.get(e.to);
    if (node === undefined || known.has(node.id)) return [];
    const base = { role: 'customer', inputName: '', inputCin: '', match: 'via_applicant_record' } as const;
    const customer = subjectFromNode(ix, node, base);
    return [{ customer, declared: false, applicantLink: toLink(ix, e), chain: cascade(ix, node.id) }];
  });
  return [...declared, ...undeclared];
}

/** Runs the check over a loaded index; the result is saved on the application. */
export function checkPublicRecords(ix: LabIndex, data: ApplicationData, ranAt: string): PublicRecordsSnapshot {
  const r = resolver(ix);
  const { businessName, registrationNo } = data.business;
  const applicant = resolveSubject(ix, r, 'applicant', businessName, registrationNo);
  const customersChecked = data.receivables.customers
    .filter((c) => c.name.trim() !== '')
    .map((c) => resolveSubject(ix, r, 'customer', c.name, c.cin));
  return {
    ranAt,
    datasetLabel: ix.bundle.meta.label,
    datasetBuiltAt: ix.bundle.meta.dataset_built_at,
    graphBuiltAt: ix.bundle.meta.generated_at,
    inputsKey: publicRecordsInputsKey(data),
    applicant,
    exposures: exposures(ix, applicant, customersChecked),
    customersChecked,
  };
}

/** Resolves one company (exact CIN, then exact name) with its records. */
export function lookupCompany(ix: LabIndex, name: string, cin: string): PrSubject {
  return resolveSubject(ix, resolver(ix), 'applicant', name, cin);
}

let cached: Promise<LabIndex> | null = null;

/** Forgets the loaded graph, e.g. after sign-in so the cloud-published version is used. */
export function resetPublicRecords(): void {
  cached = null;
}

/** Loads the published real-data graph once per page (B-41: ~5 MB gzip). */
export function loadPublicRecords(): Promise<LabIndex> {
  cached ??= (async (): Promise<LabIndex> => {
    const entries = await fetchIndex();
    const real = entries.find((e) => !e.synthetic);
    if (real === undefined) throw new GraphLabLoadError('No public-records graph is published.');
    return indexBundle(await loadBundleFromUrl(real.file));
  })().catch((e: unknown) => {
    cached = null;
    throw e;
  });
  return cached;
}
