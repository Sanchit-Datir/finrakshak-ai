import {
  changeBlock,
  decideAlert,
  formatChangeBlock,
  monthEnd,
  scoreRun,
  verifiedCaseIds,
  type AlertDecision,
  type AlertState,
  type LoanScore,
  type MonitoringRuleId,
  type PatternMatcher,
  type RunFinding,
  type ScoreSnapshot,
  type ScoringSettings,
} from '@fund-tracker/shared';
import type { ScoringData } from './inputs.js';
import type { UsableLibrary } from './patternSources.js';

/**
 * Replays the data month by month (RISK_SCORING_PLAN.md, "Replay"): one scoring run on the last IST day
 * of each month, in order, carrying each loan's alert state and alerted reasons forward, as the daily job
 * will carry them from its previous row. No model is called and nothing is written here.
 */

export interface ReplayRow {
  readonly month: string;
  readonly score: LoanScore;
  /** The band shown to a reviewer: it lags a fall by the clean-run rule. */
  readonly held_band: AlertState['held_band'];
  readonly alert: Pick<AlertDecision, 'kind' | 'delta' | 'new_reason_keys' | 'alert_reason_keys'>;
  readonly fired_rules: readonly MonitoringRuleId[];
  readonly change_text: string;
}

export interface ReplayResult {
  readonly rows: readonly ReplayRow[];
  readonly findings: readonly RunFinding[];
}

export interface ReplayOptions {
  readonly months: readonly string[];
  readonly settings: ScoringSettings;
  readonly library: UsableLibrary;
  readonly matcher: PatternMatcher;
}

interface LoanMemory {
  state: AlertState;
  snapshot: ScoreSnapshot;
  alerted: Set<string>;
}

function stepLoan(
  memory: Map<string, LoanMemory>,
  score: LoanScore,
  settings: ScoringSettings,
): Omit<ReplayRow, 'month' | 'fired_rules'> {
  const prev = memory.get(score.loan_id);
  const alerted = prev?.alerted ?? new Set<string>();
  const d = decideAlert(prev?.state ?? null, score, settings, alerted);
  for (const k of d.alert_reason_keys) alerted.add(k);
  const snapshot: ScoreSnapshot = {
    score: score.score,
    band: d.next.held_band,
    reasons: score.reasons,
  };
  const change_text = formatChangeBlock(changeBlock(prev?.snapshot ?? null, snapshot), {
    staleSince: score.stale_inputs ? score.data_built_on : null,
    noPatterns: score.no_patterns,
  });
  memory.set(score.loan_id, { state: d.next, snapshot, alerted });
  const { kind, delta, new_reason_keys, alert_reason_keys } = d;
  return {
    score,
    held_band: d.next.held_band,
    alert: { kind, delta, new_reason_keys, alert_reason_keys },
    change_text,
  };
}

export function replay(data: ScoringData, opts: ReplayOptions): ReplayResult {
  const memory = new Map<string, LoanMemory>();
  const verified = data.seedReview === null ? new Set<string>() : verifiedCaseIds(data.seedReview);
  const findings = new Map<string, RunFinding>();
  const add = (f: RunFinding): void => {
    findings.set(`${f.code}|${f.detail}`, f);
  };
  opts.library.findings.forEach(add);
  if (data.seedReview === null)
    add({
      code: 'no_seed_review',
      detail: 'no seed review file; support weight is 0.6 for every pattern',
    });
  for (const m of data.missingInputs) add({ code: 'missing_input', detail: m });
  const rows: ReplayRow[] = [];
  for (const month of opts.months) {
    const asOf = monthEnd(month);
    const out = scoreRun({
      asOf,
      dataBuiltOn: data.dataBuiltOn ?? asOf,
      missingInputs: data.missingInputs,
      loans: data.loans,
      transactions: data.transactions,
      entities: data.entities,
      links: data.links,
      records: data.records,
      library: opts.library.library,
      matcher: opts.matcher,
      verifiedCaseIds: verified,
      settings: opts.settings,
    });
    out.findings.forEach(add);
    for (const score of out.scores) {
      if (score.stale_inputs && score.data_built_on !== asOf)
        add({ code: 'stale_public_data', detail: `built ${score.data_built_on}` });
      rows.push({
        month,
        fired_rules: out.firedRules.get(score.loan_id) ?? [],
        ...stepLoan(memory, score, opts.settings),
      });
    }
  }
  return { rows, findings: [...findings.values()] };
}

/** `count` months from `start` (`YYYY-MM`). */
export function monthsFrom(start: string, count: number): string[] {
  const [y = NaN, m = NaN] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const index = y * 12 + (m - 1) + i;
    const ny = Math.floor(index / 12);
    return `${ny}-${String(index - ny * 12 + 1).padStart(2, '0')}`;
  });
}
