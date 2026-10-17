import { istDate } from '../../time.js';
import { recordKindOf, type RecordKind } from '../recordKinds.js';
import type { Pattern } from '../patterns/schema.js';
import { timelineFromEvents, type PatternMatcher } from '../patterns/timeline.js';
import { detectMonitoring } from '../rules/index.js';
import type { MonitoringRuleId, RuleEntity, RuleLoan, RuleTransaction } from '../rules/types.js';
import { behaviourLayer } from './behaviour.js';
import { directLayer } from './direct.js';
import { flaggedNeighbours, graphLayer } from './graph.js';
import {
  deriveTradingLinks,
  relatedPartiesOf,
  type PublicRecord,
  type ScoringLink,
} from './inputs.js';
import { patternLayer } from './patternLayer.js';
import { combineLayers } from './score.js';
import type { ScoringSettings } from './settings.js';
import type { LoanScore, RunFinding } from './types.js';

/**
 * One scoring run for one IST day over every disbursed loan (pure; no I/O, no clock, no model). Rows
 * dated after `asOf` are ignored, so replaying past days never sees the future.
 */

export interface ScoringLoan extends RuleLoan {
  readonly borrowerId: string;
  /** The branch that holds the loan; stored with each score so the app can scope by branch later. */
  readonly branchId?: string;
}

export interface ScoringRunInput {
  readonly asOf: string;
  readonly dataBuiltOn: string;
  readonly missingInputs: readonly string[];
  readonly loans: readonly ScoringLoan[];
  readonly transactions: readonly RuleTransaction[];
  readonly entities: readonly RuleEntity[];
  readonly links: readonly ScoringLink[];
  readonly records: readonly PublicRecord[];
  /** Null when no library could be read; the run is then marked `no_patterns`. */
  readonly library: {
    readonly libraryVersion: number;
    readonly patterns: readonly Pattern[];
  } | null;
  readonly matcher: PatternMatcher;
  readonly verifiedCaseIds: ReadonlySet<string>;
  readonly settings: ScoringSettings;
}

export interface ScoringRunOutput {
  readonly scores: LoanScore[];
  readonly findings: RunFinding[];
  /** The monitoring rules that fired on each loan up to `asOf`, whether or not a pattern used them. */
  readonly firedRules: ReadonlyMap<string, readonly MonitoringRuleId[]>;
}

type Fired = Map<string, Map<MonitoringRuleId, string[]>>;

function firedRules(
  input: ScoringRunInput,
  loans: readonly ScoringLoan[],
  txns: readonly RuleTransaction[],
): Fired {
  const out: Fired = new Map();
  const add = (loanId: string, rule: MonitoringRuleId, ids: readonly string[]): void => {
    const perLoan = out.get(loanId) ?? new Map<MonitoringRuleId, string[]>();
    perLoan.set(rule, [...new Set([...(perLoan.get(rule) ?? []), ...ids])].sort());
    out.set(loanId, perLoan);
  };
  const detections = detectMonitoring({
    loans,
    transactions: txns,
    entities: input.entities,
    relationships: input.links,
    config: input.settings.monitoring,
  });
  for (const d of detections) {
    const ids = d.transactions.map((t) => t.id);
    if (d.rule === 'repeated_counterparty') for (const id of d.loanIds) add(id, d.rule, ids);
    else add(d.loanId, d.rule, ids);
  }
  return out;
}

function flaggedKinds(records: readonly PublicRecord[]): Map<string, RecordKind[]> {
  const out = new Map<string, RecordKind[]>();
  for (const r of records) {
    const kind = recordKindOf(r.case_type);
    if (kind !== undefined) out.set(r.entity_id, [...(out.get(r.entity_id) ?? []), kind]);
  }
  return out;
}

const byAccount = (txns: readonly RuleTransaction[], account: string): RuleTransaction[] =>
  txns.filter((t) => t.fromId === account || t.toId === account);

interface RunCtx {
  readonly input: ScoringRunInput;
  readonly txns: readonly RuleTransaction[];
  readonly records: readonly PublicRecord[];
  readonly fired: Fired;
  readonly flagged: ReadonlyMap<string, readonly RecordKind[]>;
  /** The documented links plus the trading links derived from this run's payments. */
  readonly graphLinks: readonly ScoringLink[];
  readonly findings: RunFinding[];
}

function scoreLoan(ctx: RunCtx, loan: ScoringLoan): LoanScore {
  const { input } = ctx;
  const { asOf, settings } = input;
  const disbursedOn = istDate(loan.disbursedAt);
  const related = relatedPartiesOf(loan.borrowerId, input.links);
  const direct = directLayer(
    {
      borrowerId: loan.borrowerId,
      disbursedOn,
      asOf,
      relatedPartyIds: related,
      records: ctx.records,
    },
    settings,
  );
  const neighbours = flaggedNeighbours(
    loan.borrowerId,
    ctx.graphLinks,
    ctx.flagged,
    settings.graph.hub_min_links,
  );
  const scoredRelated = new Set(
    direct.reasons.filter((r) => r.code === 'related_party_record').map((r) => r.subject_id),
  );
  const graph = graphLayer(loan.borrowerId, neighbours, scoredRelated, settings);
  const own = ctx.records.filter((r) => r.entity_id === loan.borrowerId);
  const timeline = timelineFromEvents(
    loan.borrowerId,
    own.map((r) => ({
      event_id: r.record_id,
      date: r.date,
      case_type: r.case_type,
      source_id: r.source_id,
      evidence_status: r.evidence_status,
    })),
    asOf,
  );
  const pattern = patternLayer(
    {
      patterns: input.library?.patterns ?? [],
      matcher: input.matcher,
      timeline,
      neighbours,
      firedRules: ctx.fired.get(loan.id) ?? new Map(),
      verifiedCaseIds: input.verifiedCaseIds,
    },
    settings,
  );
  ctx.findings.push(...pattern.findings);
  const behaviour = behaviourLayer(
    {
      loan: { ...loan, disbursedOn },
      transactions: byAccount(ctx.txns, loan.accountEntityId),
      asOf,
    },
    settings,
  );
  return combineLayers(
    {
      loanId: loan.id,
      borrowerId: loan.borrowerId,
      asOf,
      dataBuiltOn: input.dataBuiltOn,
      missingInputs: input.missingInputs,
      patternVersion: input.library?.libraryVersion ?? null,
      direct,
      pattern,
      graph,
      behaviour,
    },
    settings,
  );
}

const dedupe = (fs: readonly RunFinding[]): RunFinding[] => [
  ...new Map(fs.map((f) => [`${f.code}|${f.detail}`, f])).values(),
];

export function scoreRun(input: ScoringRunInput): ScoringRunOutput {
  const loans = input.loans
    .filter((l) => istDate(l.disbursedAt) <= input.asOf)
    .sort((a, b) => a.id.localeCompare(b.id));
  const txns = input.transactions.filter((t) => istDate(t.at) <= input.asOf);
  const records = input.records.filter(
    (r) => r.date !== null && r.date !== '' && r.date <= input.asOf,
  );
  const ctx: RunCtx = {
    input,
    txns,
    records,
    fired: firedRules(input, loans, txns),
    flagged: flaggedKinds(records),
    graphLinks: [...input.links, ...deriveTradingLinks(loans, txns, input.entities)],
    findings: [],
  };
  const scores = loans.map((l) => scoreLoan(ctx, l));
  const fired = new Map([...ctx.fired].map(([id, rules]) => [id, [...rules.keys()].sort()]));
  return { scores, findings: dedupe(ctx.findings), firedRules: fired };
}
