import type { AnalyseApplicationResult, InvestigateApplicationResult } from '@finrakshak-ai/shared';
import { AI_FINDING_KIND_LABEL, PRIORITY_LABEL } from '../domain/labels.js';
import type { InvestigationEvidence, Priority } from '../domain/schemas.js';
import type { Finding } from './checks.js';
import { citationKey } from './investigation-evidence.js';

/**
 * Merges the two AI replies (document analysis and investigator) into a short list of leads and a
 * headline, all by code: no extra model call, no score of its own (B-58). Pure, so it is unit-tested.
 */

export type LeadSource = 'documents' | 'public_records';

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  documents: 'From documents',
  public_records: 'From public records',
};

export interface Lead {
  readonly id: string;
  readonly source: LeadSource;
  readonly priority: Priority;
  /** One line. */
  readonly text: string;
  /** Short label, e.g. the check or finding kind. */
  readonly label: string;
  /** Evidence lines shown when the lead is expanded. */
  readonly evidence: readonly string[];
}

export type RunStatus = 'both' | 'documents' | 'investigator' | 'none';

export const MAX_LEADS = 5;
const RANK: Record<Priority, number> = { urgent: 0, needs_attention: 1, routine: 2 };
const LINE_CHARS = 160;
const SIMILAR = 0.5;

export function runStatus(
  analysis: AnalyseApplicationResult | null,
  investigation: InvestigateApplicationResult | null,
): RunStatus {
  if (analysis !== null && investigation !== null) return 'both';
  if (analysis !== null) return 'documents';
  return investigation !== null ? 'investigator' : 'none';
}

export function oneLine(text: string, max = LINE_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2))}…`;
}

const words = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );

/** Share of the smaller word set found in the other (1 = one text contains the other's words). */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  const small = Math.min(x.size, y.size);
  if (small === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / small;
}

export function documentLeads(
  analysis: AnalyseApplicationResult | null,
  findings: readonly Finding[],
): Lead[] {
  if (analysis === null) return [];
  return analysis.findingNotes.flatMap((n) => {
    const f = findings.find((x) => x.id === n.findingId);
    if (f === undefined) return [];
    const facts = analysis.facts
      .filter((x) => f.evidence.some((e) => e.docId === x.docId && e.fieldId === x.fieldId))
      .map((x) => x.statement);
    return [
      {
        id: `doc:${f.id}`,
        source: 'documents' as const,
        priority: f.priority,
        text: oneLine(`${f.title}: ${n.note}`),
        label: f.title,
        evidence: [f.observed, ...facts, ...f.evidence.map((e) => `${e.label}: ${e.value}`)].filter(
          (s) => s.trim() !== '',
        ),
      },
    ];
  });
}

export function recordLeads(
  investigation: InvestigateApplicationResult | null,
  evidence: Readonly<Record<string, InvestigationEvidence>>,
): Lead[] {
  if (investigation === null) return [];
  return investigation.findings.map((f) => ({
    id: `inv:${f.id}`,
    source: 'public_records' as const,
    priority: f.priority,
    text: oneLine(f.statement),
    label: AI_FINDING_KIND_LABEL[f.kind],
    evidence: f.citations.map((c) => {
      const e = evidence[citationKey(c)];
      return e === undefined ? citationKey(c) : `${e.label}: ${e.detail}`;
    }),
  }));
}

/** Best first by priority; equal priorities keep their input order (documents first, then records). */
function order(a: Lead, b: Lead): number {
  return RANK[a.priority] - RANK[b.priority];
}

/** Ranks all leads and drops a lead that repeats a better-ranked one (same words, any source). */
export function rankLeads(leads: readonly Lead[]): Lead[] {
  const sorted = leads.map((l, i) => ({ l, i })).sort((a, b) => order(a.l, b.l) || a.i - b.i);
  const kept: Lead[] = [];
  for (const { l } of sorted) {
    const dup = kept.some(
      (k) => similarity(`${k.label} ${k.text}`, `${l.label} ${l.text}`) >= SIMILAR,
    );
    if (!dup) kept.push(l);
  }
  return kept;
}

const countBy = (leads: readonly Lead[], p: Priority): number =>
  leads.filter((l) => l.priority === p).length;

/** 2–3 sentences built from the merged leads; says what is missing when one half did not run. */
export function buildHeadline(leads: readonly Lead[], status: RunStatus): string {
  if (status === 'none') return '';
  const parts: string[] = [];
  if (leads.length === 0) {
    parts.push('The AI raised no lead for review.');
  } else {
    const tally = (['urgent', 'needs_attention', 'routine'] as const)
      .map((p) => [countBy(leads, p), PRIORITY_LABEL[p]] as const)
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${String(n)} ${label}`)
      .join(', ');
    parts.push(
      `${String(leads.length)} lead${leads.length === 1 ? '' : 's'} for review (${tally}).`,
    );
    const top = leads[0];
    if (top !== undefined) parts.push(`Top lead: ${top.text.replace(/[.…]+$/, '')}.`);
  }
  if (status === 'documents') parts.push('The public-record investigation did not run.');
  if (status === 'investigator') parts.push('The document analysis did not run.');
  return parts.join(' ');
}
