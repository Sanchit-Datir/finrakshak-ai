import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { normalizeCompanyName } from '../../resolve/names.js';
import { CASE_TYPES, type AiExtractionRecord } from './schema.js';

/** One hand-checked document (ingest/eval/README.md explains how to curate the golden set). */
export const GoldenDocSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  organisations: z.array(
    z.object({ name: z.string().min(2), cin: z.string().nullable().default(null) }),
  ),
  amounts_paise: z.array(z.number().int().positive()),
  case_type: z.enum(CASE_TYPES).nullable().default(null),
});
export type GoldenDoc = z.infer<typeof GoldenDocSchema>;

/** The bar the extractor must clear before its claims may leave shadow mode (B-52). */
export const GATE = {
  minDocuments: 30,
  minCoverage: 0.9,
  orgPrecision: 0.9,
  cinPrecision: 0.95,
  amountPrecision: 0.95,
} as const;

interface Counts {
  tp: number;
  predicted: number;
  expected: number;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

function add(c: Counts, predicted: ReadonlySet<string>, expected: ReadonlySet<string>): void {
  c.predicted += predicted.size;
  c.expected += expected.size;
  for (const p of predicted) if (expected.has(p)) c.tp++;
}

export interface EvalReport {
  readonly documents: number;
  readonly covered: number;
  readonly organisations: { precision: number | null; recall: number | null };
  readonly cins: { precision: number | null; recall: number | null };
  readonly amounts: { precision: number | null; recall: number | null };
  readonly caseTypeAccuracy: number | null;
  readonly passed: boolean;
  readonly reasons: string[];
}

const metric = (c: Counts): { precision: number | null; recall: number | null } => ({
  precision: ratio(c.tp, c.predicted),
  recall: ratio(c.tp, c.expected),
});

/** Micro-averaged precision/recall of stored extractions against the golden set, and the gate. */
export function evaluate(
  golden: readonly GoldenDoc[],
  predictions: readonly AiExtractionRecord[],
): EvalReport {
  const bySha = new Map(predictions.map((p) => [p.sha256, p]));
  const orgs: Counts = { tp: 0, predicted: 0, expected: 0 };
  const cins: Counts = { tp: 0, predicted: 0, expected: 0 };
  const amounts: Counts = { tp: 0, predicted: 0, expected: 0 };
  let covered = 0;
  let caseHits = 0;
  let caseTotal = 0;
  for (const g of golden) {
    const p = bySha.get(g.sha256);
    if (!p) continue;
    covered++;
    const rows = p.rows;
    add(
      orgs,
      new Set(
        rows.flatMap((r) =>
          r.kind === 'organisation' && r.name ? [normalizeCompanyName(r.name)] : [],
        ),
      ),
      new Set(g.organisations.map((o) => normalizeCompanyName(o.name))),
    );
    add(
      cins,
      new Set(rows.flatMap((r) => (r.cin ? [r.cin] : []))),
      new Set(g.organisations.flatMap((o) => (o.cin ? [o.cin] : []))),
    );
    add(
      amounts,
      new Set(rows.flatMap((r) => (r.amount ? [String(r.amount.minor)] : []))),
      new Set(g.amounts_paise.map(String)),
    );
    if (g.case_type !== null) {
      caseTotal++;
      if (p.case_type === g.case_type) caseHits++;
    }
  }
  return judge({ documents: golden.length, covered, orgs, cins, amounts, caseHits, caseTotal });
}

function judge(m: {
  documents: number;
  covered: number;
  orgs: Counts;
  cins: Counts;
  amounts: Counts;
  caseHits: number;
  caseTotal: number;
}): EvalReport {
  const reasons: string[] = [];
  const coverage = ratio(m.covered, m.documents) ?? 0;
  const orgP = ratio(m.orgs.tp, m.orgs.predicted);
  const cinP = ratio(m.cins.tp, m.cins.predicted);
  const amtP = ratio(m.amounts.tp, m.amounts.predicted);
  if (m.documents < GATE.minDocuments)
    reasons.push(`golden set has ${m.documents} documents; at least ${GATE.minDocuments} needed`);
  if (coverage < GATE.minCoverage)
    reasons.push(`only ${m.covered} of ${m.documents} golden documents were extracted`);
  if (orgP !== null && orgP < GATE.orgPrecision)
    reasons.push(`organisation precision ${orgP.toFixed(2)} < ${GATE.orgPrecision}`);
  if (cinP !== null && cinP < GATE.cinPrecision)
    reasons.push(`CIN precision ${cinP.toFixed(2)} < ${GATE.cinPrecision}`);
  if (amtP !== null && amtP < GATE.amountPrecision)
    reasons.push(`amount precision ${amtP.toFixed(2)} < ${GATE.amountPrecision}`);
  return {
    documents: m.documents,
    covered: m.covered,
    organisations: metric(m.orgs),
    cins: metric(m.cins),
    amounts: metric(m.amounts),
    caseTypeAccuracy: ratio(m.caseHits, m.caseTotal),
    passed: reasons.length === 0,
    reasons,
  };
}

export async function readGolden(file: string): Promise<GoldenDoc[]> {
  const text = await readFile(file, 'utf8');
  // Numbered before blank and comment lines are skipped, so errors name the line in the file.
  return text
    .split('\n')
    .map((l, i) => ({ l, lineNo: i + 1 }))
    .filter(({ l }) => l.trim().length > 0 && !l.trim().startsWith('//'))
    .map(({ l, lineNo }) => {
      try {
        return GoldenDocSchema.parse(JSON.parse(l));
      } catch (e) {
        throw new Error(`Invalid golden line ${lineNo} in ${file}`, { cause: e });
      }
    });
}
