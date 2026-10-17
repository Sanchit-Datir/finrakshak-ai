import type { LoanScore, SynthClass, SynthTruth } from '@fund-tracker/shared';
import type { ReplayRow } from './replay.js';

/**
 * Compares a replay with the synthetic truth labels (RISK_SCORING_PLAN.md, "Evaluation on synthetic
 * data"). This checks plumbing, not accuracy: the generator wrote both the data and the labels, so a good
 * result here says nothing about real loans (B-55). Only this module reads truth; the scorer never does.
 */

export interface ClassSummary {
  loans: number;
  loans_alerted: number;
  alerts: number;
}

export interface ArchetypeSummary extends ClassSummary {
  /** Defaulters: loans with an alert from the onset month up to `withinMonths` after it. */
  alerted_in_window: number;
  /** Months where the shown band equals the expected band, in percent of months compared. */
  band_agreement_percent: number;
  /** Expected reason codes that our reasons contained, in percent, over months that expect any. */
  expected_reasons_found_percent: number | null;
}

export interface EvaluationReport {
  readonly synthetic: true;
  readonly note: string;
  readonly loans: number;
  readonly months: number;
  readonly alerts: number;
  readonly alerts_per_1000_loans_per_month: number;
  readonly by_class: Partial<Record<SynthClass, ClassSummary>>;
  readonly by_archetype: Record<string, ArchetypeSummary>;
  readonly rules: { expected: number; found: number; missing: string[]; unexpected: string[] };
  readonly defaulters_missed: string[];
  readonly controls_alerted: string[];
  readonly held_out_pattern_matches: string[];
}

/** Our reason codes in the truth's vocabulary: a typology pattern counts as its monitoring rule. */
export function reasonCodesOf(score: LoanScore): Set<string> {
  const out = new Set<string>();
  for (const r of score.reasons) {
    const rule = r.facts['rule_id'];
    out.add(r.code === 'pattern_match' && typeof rule === 'string' ? rule : r.code);
  }
  return out;
}

const addMonths = (month: string, n: number): string => {
  const [y = NaN, m = NaN] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  const ny = Math.floor(index / 12);
  return `${ny}-${String(index - ny * 12 + 1).padStart(2, '0')}`;
};
const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n * 1000) / d) / 10);

interface LoanStats {
  alerts: number;
  inWindow: boolean;
  bandHits: number;
  bandMonths: number;
  expectedReasons: number;
  foundReasons: number;
  rules: Set<string>;
  patternMatched: boolean;
}

function loanStats(truth: SynthTruth, rows: readonly ReplayRow[], withinMonths: number): LoanStats {
  const s: LoanStats = {
    alerts: 0,
    inWindow: false,
    bandHits: 0,
    bandMonths: 0,
    expectedReasons: 0,
    foundReasons: 0,
    rules: new Set(),
    patternMatched: false,
  };
  const expected = new Map(truth.months.map((m) => [m.month, m]));
  const windowEnd = truth.onset_month === null ? null : addMonths(truth.onset_month, withinMonths);
  for (const row of rows) {
    row.fired_rules.forEach((r) => s.rules.add(r));
    if (row.score.reasons.some((r) => r.code === 'pattern_match')) s.patternMatched = true;
    if (row.alert.kind !== 'none') {
      s.alerts++;
      if (
        truth.onset_month !== null &&
        windowEnd !== null &&
        row.month >= truth.onset_month &&
        row.month <= windowEnd
      )
        s.inWindow = true;
    }
    const want = expected.get(row.month);
    if (want === undefined) continue;
    s.bandMonths++;
    if (want.expected_band === row.held_band) s.bandHits++;
    const ours = reasonCodesOf(row.score);
    s.expectedReasons += want.expected_reasons.length;
    s.foundReasons += want.expected_reasons.filter((r) => ours.has(r)).length;
  }
  return s;
}

type ArchTally = ArchetypeSummary & { hits: number; compared: number; exp: number; found: number };
type Rules = EvaluationReport['rules'];
interface Lists {
  missed: string[];
  controls: string[];
  heldOut: string[];
}

function tallyArchetype(byArch: Record<string, ArchTally>, t: SynthTruth, s: LoanStats): void {
  const a = (byArch[t.archetype] ??= {
    loans: 0,
    loans_alerted: 0,
    alerts: 0,
    alerted_in_window: 0,
    band_agreement_percent: 0,
    expected_reasons_found_percent: null,
    hits: 0,
    compared: 0,
    exp: 0,
    found: 0,
  });
  a.loans++;
  a.alerts += s.alerts;
  if (s.alerts > 0) a.loans_alerted++;
  if (s.inWindow) a.alerted_in_window++;
  a.hits += s.bandHits;
  a.compared += s.bandMonths;
  a.exp += s.expectedReasons;
  a.found += s.foundReasons;
}

function tallyClass(
  byClass: Partial<Record<SynthClass, ClassSummary>>,
  t: SynthTruth,
  s: LoanStats,
): void {
  const c = (byClass[t.class] ??= { loans: 0, loans_alerted: 0, alerts: 0 });
  c.loans++;
  c.alerts += s.alerts;
  if (s.alerts > 0) c.loans_alerted++;
}

function tallyRules(rules: Rules, t: SynthTruth, s: LoanStats): void {
  rules.expected += t.expected_rules.length;
  for (const r of t.expected_rules)
    if (s.rules.has(r)) rules.found++;
    else rules.missing.push(`${t.loan_id}:${r}`);
  for (const r of s.rules)
    if (!t.expected_rules.some((e) => e === r)) rules.unexpected.push(`${t.loan_id}:${r}`);
}

function tallyLists(lists: Lists, t: SynthTruth, s: LoanStats): void {
  const label = `${t.loan_id} (${t.archetype})`;
  if (t.class === 'defaulter' && !s.inWindow) lists.missed.push(label);
  if ((t.class === 'control' || t.class === 'lookalike') && s.alerts > 0)
    lists.controls.push(label);
  if (t.class === 'held_out' && s.patternMatched) lists.heldOut.push(t.loan_id);
}

const finishArchetypes = (byArch: Record<string, ArchTally>): Record<string, ArchetypeSummary> =>
  Object.fromEntries(
    Object.entries(byArch).map(([k, { hits, compared, exp, found, ...rest }]) => [
      k,
      {
        ...rest,
        band_agreement_percent: pct(hits, compared),
        expected_reasons_found_percent: exp === 0 ? null : pct(found, exp),
      },
    ]),
  );

export function evaluate(
  rows: readonly ReplayRow[],
  truth: readonly SynthTruth[],
  withinMonths: number,
): EvaluationReport {
  const rowsByLoan = new Map<string, ReplayRow[]>();
  for (const r of rows)
    rowsByLoan.set(r.score.loan_id, [...(rowsByLoan.get(r.score.loan_id) ?? []), r]);
  const byClass: Partial<Record<SynthClass, ClassSummary>> = {};
  const byArch: Record<string, ArchTally> = {};
  const rules: Rules = { expected: 0, found: 0, missing: [], unexpected: [] };
  const lists: Lists = { missed: [], controls: [], heldOut: [] };
  for (const t of truth) {
    const s = loanStats(t, rowsByLoan.get(t.loan_id) ?? [], withinMonths);
    tallyArchetype(byArch, t, s);
    tallyClass(byClass, t, s);
    tallyRules(rules, t, s);
    tallyLists(lists, t, s);
  }
  const alerts = rows.filter((r) => r.alert.kind !== 'none').length;
  return {
    synthetic: true,
    note: 'SYNTH data. Plumbing, not accuracy: the labels come from the same generator as the data (B-55).',
    loans: truth.length,
    months: new Set(rows.map((r) => r.month)).size,
    alerts,
    /** Per 1,000 loan-months actually scored (a loan counts from its disbursement month). */
    alerts_per_1000_loans_per_month:
      rows.length === 0 ? 0 : Math.round((alerts * 10_000) / rows.length) / 10,
    by_class: byClass,
    by_archetype: finishArchetypes(byArch),
    rules,
    defaulters_missed: lists.missed,
    controls_alerted: lists.controls,
    held_out_pattern_matches: lists.heldOut,
  };
}
