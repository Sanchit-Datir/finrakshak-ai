import { recordKindOf } from '../recordKinds.js';
import { pointsShare } from './calc.js';
import { statusOf, type PublicRecord } from './inputs.js';
import type { ScoringSettings } from './settings.js';
import type { LayerResult, Reason, ReasonCode, ReasonEvidenceStatus } from './types.js';

/**
 * Direct match layer (max 40): public adverse records on the borrower and on its directors and owners.
 * The records arrive already matched to entities (B-37). An insolvency, liquidation or enforcement
 * record on the borrower dated after disbursement scores the full row and sets the override to Urgent
 * review (owner's decision, 17 Oct 2026); evidence-status weighting applies to every other row only.
 */

export interface DirectInput {
  readonly borrowerId: string;
  /** IST day of disbursement. "After" means strictly later, as in the web watch. */
  readonly disbursedOn: string;
  readonly asOf: string;
  readonly relatedPartyIds: readonly string[];
  readonly records: readonly PublicRecord[];
}

export interface DirectResult extends LayerResult {
  readonly override: boolean;
}

type Row = 'after' | 'before' | 'nfra';

const rowOf = (r: PublicRecord, disbursedOn: string): Row | null => {
  if (recordKindOf(r.case_type) !== undefined)
    return (r.date ?? '') > disbursedOn ? 'after' : 'before';
  return r.source_id === 'nfra' ? 'nfra' : null;
};

const ROW_CODE: Readonly<Record<Row, ReasonCode>> = {
  after: 'public_record_after_disbursement',
  before: 'public_record_before_disbursement',
  nfra: 'nfra_finding',
};

interface Ctx {
  readonly input: DirectInput;
  readonly s: ScoringSettings['direct'];
}

const rowPoints = (ctx: Ctx, row: Row, status: ReasonEvidenceStatus): number => {
  const base = {
    after: ctx.s.after_disbursement,
    before: ctx.s.before_disbursement,
    nfra: ctx.s.nfra_finding,
  }[row];
  return row === 'after' ? base : pointsShare(base, ctx.s.status_percent[status]);
};

function recordReason(ctx: Ctx, r: PublicRecord, row: Row, related: boolean): Reason {
  const status = statusOf(r.evidence_status);
  const full = rowPoints(ctx, row, status);
  return {
    code: related ? 'related_party_record' : ROW_CODE[row],
    layer: 'direct',
    reason_key: `${related ? 'related_party_record' : ROW_CODE[row]}|${r.entity_id}|${r.record_id}`,
    subject_id: r.entity_id,
    points: related ? pointsShare(full, ctx.s.related_party_percent) : full,
    evidence_ids: [r.record_id],
    evidence_statuses: [status],
    source: r.source_id,
    facts: { date: r.date ?? '', case_type: r.case_type, row },
    pattern: null,
  };
}

/** One extra reason when the borrower has several adverse proceedings or records in many sources. */
function breadthReason(ctx: Ctx, adverse: readonly PublicRecord[]): Reason | null {
  const sources = new Set(adverse.map((r) => r.source_id));
  const many = sources.size >= ctx.s.many_sources_min;
  if (!many && adverse.length < ctx.s.several_proceedings_min) return null;
  const statuses = [...new Set(adverse.map((r) => statusOf(r.evidence_status)))].sort();
  const percent = Math.min(...statuses.map((st) => ctx.s.status_percent[st]));
  const code: ReasonCode = many ? 'many_sources' : 'several_proceedings';
  return {
    code,
    layer: 'direct',
    reason_key: `${code}|${ctx.input.borrowerId}`,
    subject_id: ctx.input.borrowerId,
    points: pointsShare(many ? ctx.s.many_sources : ctx.s.several_proceedings, percent),
    evidence_ids: adverse.map((r) => r.record_id).sort(),
    evidence_statuses: statuses,
    source: [...sources].sort().join(','),
    facts: { count: adverse.length, sources: sources.size },
    pattern: null,
  };
}

export function directLayer(input: DirectInput, settings: ScoringSettings): DirectResult {
  const ctx: Ctx = { input, s: settings.direct };
  const related = new Set(input.relatedPartyIds);
  const reasons: Reason[] = [];
  const borrowerAdverse: PublicRecord[] = [];
  let override = false;
  const known = input.records
    .filter((r) => r.date !== null && r.date !== '' && r.date <= input.asOf)
    .sort(
      (a, b) =>
        (a.date ?? '').localeCompare(b.date ?? '') || a.record_id.localeCompare(b.record_id),
    );
  for (const r of known) {
    const isBorrower = r.entity_id === input.borrowerId;
    if (!isBorrower && !related.has(r.entity_id)) continue;
    const row = rowOf(r, input.disbursedOn);
    if (row === null) continue;
    reasons.push(recordReason(ctx, r, row, !isBorrower));
    if (isBorrower) borrowerAdverse.push(r);
    if (isBorrower && row === 'after') override = true;
  }
  const breadth = breadthReason(ctx, borrowerAdverse);
  if (breadth !== null) reasons.push(breadth);
  const sum = reasons.reduce((n, r) => n + r.points, 0);
  return { points: Math.min(settings.layer_max.direct, sum), reasons, override };
}
