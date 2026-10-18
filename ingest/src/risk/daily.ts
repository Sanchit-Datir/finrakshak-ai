import { createHash } from 'node:crypto';
import {
  isRaised,
  scoreRun,
  verifiedCaseIds,
  type LoanScore,
  type PatternMatcher,
  type PriorRun,
  type RiskAlertDoc,
  type RiskLatestDoc,
  type RiskPatternRow,
  type RiskScoreRow,
  type RunFinding,
  type ScoringSettings,
} from '@finrakshak-ai/shared';
import type { ScoringData } from './inputs.js';
import type { UsableLibrary } from './patternSources.js';
import { stepLoan, type LoanMemory, type LoanStep } from './step.js';

/**
 * One daily scoring run (REMAINING_WORK.md, W2c and W2d), pure: no I/O, no clock, no model (B-15). Each
 * loan starts from the state its previous run left in `synthRiskLatest`; a retry of the same IST day
 * starts from the state before that day, so it gives the same rows, ids and alerts again (B-24).
 */

export interface DailyInput {
  readonly data: ScoringData;
  /** IST day of the run (B-27). */
  readonly asOf: string;
  readonly runId: string;
  /** UTC instant written as `updated_at` / `created_at`. */
  readonly now: string;
  readonly settings: ScoringSettings;
  readonly library: UsableLibrary;
  readonly matcher: PatternMatcher;
  readonly previous: ReadonlyMap<string, RiskLatestDoc>;
}

export interface DailyOutput {
  readonly scoreRows: RiskScoreRow[];
  readonly alertDocs: RiskAlertDoc[];
  readonly latestDocs: RiskLatestDoc[];
  readonly patternRows: RiskPatternRow[];
  readonly findings: RunFinding[];
}

export class ScoringOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoringOrderError';
  }
}

/** Branch of a loan that has none (stored so branch scoping can be added later). */
export const UNKNOWN_BRANCH = 'unknown';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Loan plus the alerted reason keys: the same alert again is the same id (and document). */
export function alertId(loanId: string, reasonKeys: readonly string[]): string {
  const safeLoan = loanId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  return `${safeLoan}_${sha256([...reasonKeys].sort().join('\n')).slice(0, 24)}`;
}

/** The run before `asOf`: the stored one, or for a retry of the same day the one before it. */
export function priorFor(doc: RiskLatestDoc | undefined, asOf: string): PriorRun | null {
  if (doc === undefined) return null;
  if (doc.as_of < asOf) return { as_of: doc.as_of, state: doc.state, score: doc.latest };
  if (doc.as_of === asOf) return doc.previous;
  throw new ScoringOrderError(
    `loan ${doc.loan_id} was already scored for ${doc.as_of}, after ${asOf}; use the replay for past days`,
  );
}

const memoryOf = (prior: PriorRun | null): LoanMemory | null =>
  prior === null
    ? null
    : {
        state: prior.state,
        snapshot: {
          score: prior.score.score,
          band: prior.state.held_band,
          reasons: prior.score.reasons,
        },
        alerted: new Set(prior.state.alerted_keys),
      };

function scoreRow(
  input: DailyInput,
  score: LoanScore,
  branchId: string,
  prior: PriorRun | null,
  step: LoanStep,
): RiskScoreRow {
  return {
    ...score,
    run_id: input.runId,
    branch_id: branchId,
    held_band: step.held_band,
    previous_score: prior?.score.score ?? null,
    previous_band: prior?.state.held_band ?? null,
    delta: step.alert.delta,
    alert_kind: step.alert.kind,
    synthetic: true,
  };
}

function alertDoc(
  input: DailyInput,
  score: LoanScore,
  branchId: string,
  step: LoanStep,
): RiskAlertDoc | null {
  const { kind, alert_reason_keys: keys } = step.alert;
  if (!isRaised(kind)) return null;
  return {
    alert_id: alertId(score.loan_id, keys),
    loan_id: score.loan_id,
    branch_id: branchId,
    borrower_id: score.borrower_id,
    run_id: input.runId,
    as_of: score.as_of,
    kind,
    band: step.held_band,
    score: score.score,
    delta: step.alert.delta,
    reasons: score.reasons.filter((r) => keys.includes(r.reason_key)),
    change_text: step.change_text,
    settings_version: score.settings_version,
    data_built_on: score.data_built_on,
    created_at: input.now,
    status: 'open',
    synthetic: true,
  };
}

function latestDoc(
  input: DailyInput,
  score: LoanScore,
  branchId: string,
  prior: PriorRun | null,
  step: LoanStep,
): RiskLatestDoc {
  return {
    loan_id: score.loan_id,
    branch_id: branchId,
    borrower_id: score.borrower_id,
    run_id: input.runId,
    as_of: score.as_of,
    latest: score,
    held_band: step.held_band,
    alert_kind: step.alert.kind,
    delta: step.alert.delta,
    change_text: step.change_text,
    state: {
      ...step.next.state,
      reason_keys: [...step.next.state.reason_keys],
      alerted_keys: [...step.next.alerted].sort(),
    },
    previous: prior,
    updated_at: input.now,
    synthetic: true,
  };
}

function patternRows(input: DailyInput): RiskPatternRow[] {
  const lib = input.library.library;
  if (lib === null) return [];
  const contentHash = sha256(JSON.stringify(lib.patterns));
  return lib.patterns.map((p) => ({
    run_id: input.runId,
    as_of: input.asOf,
    library_version: lib.libraryVersion,
    content_hash: contentHash,
    pattern_id: p.pattern_id,
    pattern: { ...p },
  }));
}

export function scoreDay(input: DailyInput): DailyOutput {
  const { data } = input;
  const branchOf = new Map(data.loans.map((l) => [l.id, l.branchId ?? UNKNOWN_BRANCH]));
  const priors = new Map(
    data.loans.map((l) => [l.id, priorFor(input.previous.get(l.id), input.asOf)]),
  );
  const out = scoreRun({
    asOf: input.asOf,
    dataBuiltOn: data.dataBuiltOn ?? input.asOf,
    missingInputs: data.missingInputs,
    loans: data.loans,
    transactions: data.transactions,
    entities: data.entities,
    links: data.links,
    records: data.records,
    library: input.library.library,
    matcher: input.matcher,
    verifiedCaseIds:
      data.seedReview === null ? new Set<string>() : verifiedCaseIds(data.seedReview),
    settings: input.settings,
  });
  const result: DailyOutput = {
    scoreRows: [],
    alertDocs: [],
    latestDocs: [],
    patternRows: patternRows(input),
    findings: [...input.library.findings, ...out.findings],
  };
  for (const score of out.scores) {
    const branchId = branchOf.get(score.loan_id) ?? UNKNOWN_BRANCH;
    const prior = priors.get(score.loan_id) ?? null;
    const step = stepLoan(memoryOf(prior), score, input.settings);
    result.scoreRows.push(scoreRow(input, score, branchId, prior, step));
    result.latestDocs.push(latestDoc(input, score, branchId, prior, step));
    const alert = alertDoc(input, score, branchId, step);
    if (alert !== null) result.alertDocs.push(alert);
  }
  return result;
}
