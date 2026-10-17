import type { Reason, ReasonCode, RiskBand } from './types.js';
import { RISK_BAND_LABELS } from './types.js';

/**
 * Templated reason text and the deterministic "new since last check / unchanged / score change" block
 * (no model, RISK_SCORING_PLAN.md design decision 4). The words describe records and payments
 * neutrally; a score is a lead for a reviewer, never a verdict (B-58).
 */

const words = (code: string): string => code.replace(/_/g, ' ');
const str = (r: Reason, key: string): string => String(r.facts[key] ?? '');
const num = (r: Reason, key: string): number => Number(r.facts[key] ?? 0);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const status = (r: Reason): string => r.evidence_statuses.join(', ') || 'not stated';

const TEMPLATES: Readonly<Record<ReasonCode, (r: Reason) => string>> = {
  public_record_after_disbursement: (r) =>
    `A public record (${words(str(r, 'case_type'))}, source ${r.source}) dated ${str(r, 'date')} names the borrower after disbursement. Evidence status: ${status(r)}.`,
  public_record_before_disbursement: (r) =>
    `A public record (${words(str(r, 'case_type'))}, source ${r.source}) dated ${str(r, 'date')} named the borrower before disbursement (context). Evidence status: ${status(r)}.`,
  nfra_finding: (r) =>
    `An NFRA record dated ${str(r, 'date')} concerns the borrower's audit. Evidence status: ${status(r)}.`,
  several_proceedings: (r) =>
    `${plural(num(r, 'count'), 'public record names', 'public records name')} the borrower.`,
  many_sources: (r) =>
    `Public records from ${num(r, 'sources')} sources name the borrower (${plural(num(r, 'count'), 'record', 'records')}).`,
  related_party_record: (r) =>
    `A public record (${words(str(r, 'case_type'))}, source ${r.source}) dated ${str(r, 'date')} names ${r.subject_id}, a director or owner of the borrower. Evidence status: ${status(r)}.`,
  graph_proximity: (r) =>
    `An entity with a ${words(str(r, 'kinds'))} record is ${plural(num(r, 'hops'), 'link', 'links')} away from the borrower (${words(str(r, 'link_status'))} link).`,
  pattern_match: (r) => {
    const p = r.pattern;
    const name = p === null ? 'unknown' : p.pattern_name;
    const rule = str(r, 'rule_id');
    const lead =
      rule === ''
        ? 'The public timeline is similar to'
        : `The monitoring rule ${words(rule)} fired, matching`;
    return `${lead} the pattern "${name}" (strength ${p?.strength ?? 0}, support weight ${p?.support_weight ?? 0}).`;
  },
  missed_emi: (r) =>
    `${plural(num(r, 'count'), 'EMI was', 'EMIs were')} not paid by the end of the grace period (latest due ${str(r, 'latest_due')}).`,
  late_emi: (r) =>
    `${plural(num(r, 'count'), 'EMI was', 'EMIs were')} paid after the grace period (up to ${num(r, 'max_days_late')} days late).`,
  partial_emi: (r) =>
    `${plural(num(r, 'count'), 'EMI was', 'EMIs were')} paid below the usual amount.`,
  growing_delay: (r) =>
    `The delay grew over the last ${num(r, 'count')} EMIs (${str(r, 'days')} days late).`,
  receipts_fall: (r) =>
    `Receipts into the account fell ${num(r, 'percent')}% in the last 90 days against the 90 days before.`,
};

/**
 * One line per reason, with its points. Direct and behaviour points add up (to the layer cap); the
 * pattern and graph layers count only their largest reason, so the text says so.
 */
export const reasonText = (r: Reason): string => {
  const pts = plural(r.points, 'point', 'points');
  const tail =
    r.layer === 'pattern' || r.layer === 'graph'
      ? `${pts}; the layer counts only its largest`
      : `+${pts}`;
  return `${TEMPLATES[r.code](r)} (${tail})`;
};

export interface ScoreSnapshot {
  readonly score: number;
  readonly band: RiskBand;
  readonly reasons: readonly Reason[];
}

export interface ChangeBlock {
  readonly fresh: readonly Reason[];
  readonly unchanged: readonly Reason[];
  readonly gone: readonly Reason[];
  readonly previous: ScoreSnapshot | null;
  readonly current: ScoreSnapshot;
}

const positive = (rs: readonly Reason[]): Reason[] => rs.filter((r) => r.points > 0);

/** Compares this run's reasons with the previous run's by reason key. */
export function changeBlock(previous: ScoreSnapshot | null, current: ScoreSnapshot): ChangeBlock {
  const before = new Set(positive(previous?.reasons ?? []).map((r) => r.reason_key));
  const now = positive(current.reasons);
  const nowKeys = new Set(now.map((r) => r.reason_key));
  return {
    fresh: now.filter((r) => !before.has(r.reason_key)),
    unchanged: now.filter((r) => before.has(r.reason_key)),
    gone: positive(previous?.reasons ?? []).filter((r) => !nowKeys.has(r.reason_key)),
    previous,
    current,
  };
}

const section = (title: string, rs: readonly Reason[]): string[] => [
  `${title}:`,
  ...(rs.length === 0 ? ['- none'] : rs.map((r) => `- ${reasonText(r)}`)),
];

export interface ChangeNotes {
  /** B-56: the public data was stale, so a fall is not shown as an improvement. */
  readonly staleSince?: string | null;
  /** B-56: no approved pattern was available. */
  readonly noPatterns?: boolean;
}

function scoreLine(b: ChangeBlock): string {
  const { previous: p, current: c } = b;
  if (p === null) return `First score: ${c.score} (${RISK_BAND_LABELS[c.band]}).`;
  const d = c.score - p.score;
  const sign = d > 0 ? `+${d}` : String(d);
  const band =
    p.band === c.band
      ? RISK_BAND_LABELS[c.band]
      : `${RISK_BAND_LABELS[p.band]} → ${RISK_BAND_LABELS[c.band]}`;
  return `Score change: ${p.score} → ${c.score} (${sign}). Band: ${band}.`;
}

export function formatChangeBlock(b: ChangeBlock, notes: ChangeNotes = {}): string {
  const lines = [
    ...section('New since last check', b.fresh),
    ...section('Unchanged', b.unchanged),
    ...(b.gone.length > 0 ? section('No longer present', b.gone) : []),
    scoreLine(b),
  ];
  if (notes.staleSince !== undefined && notes.staleSince !== null)
    lines.push(
      `The public data was built on ${notes.staleSince} and is stale; a lower score is not shown as an improvement.`,
    );
  if (notes.noPatterns === true)
    lines.push(
      'No approved patterns were available, so the pattern layer was not checked; its 0 is not low risk.',
    );
  return lines.join('\n');
}
