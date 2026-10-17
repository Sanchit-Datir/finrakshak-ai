import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { claimRow, extractionRecord, shaOf } from '../../test/aiFixtures.js';
import { evaluate, GATE, readGolden, type GoldenDoc } from './evaluate.js';
import type { AiClaimRow, AiExtractionRecord } from './schema.js';

const N = GATE.minDocuments;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const orgName = (i: number): string => `Company ${i} Limited`;
const cinOf = (i: number): string => `L65910MH1990PLC${String(i).padStart(6, '0')}`;
const paiseOf = (i: number): number => 100 * (i + 1);

function golden(i: number, over: Partial<GoldenDoc> = {}): GoldenDoc {
  return {
    sha256: shaOf(i + 1),
    organisations: [{ name: orgName(i), cin: cinOf(i) }],
    amounts_paise: [paiseOf(i)],
    case_type: 'penalty',
    ...over,
  };
}

interface Guess {
  /** null = no organisation row at all. */
  readonly org?: string | null;
  readonly cin?: string | null;
  readonly paise?: number;
  readonly caseType?: AiExtractionRecord['case_type'];
}

/** A stored extraction for golden document `i`, right unless told otherwise. */
function predicted(i: number, guess: Guess = {}): AiExtractionRecord {
  const sha256 = shaOf(i + 1);
  const name = guess.org === undefined ? orgName(i) : guess.org;
  const cin = guess.cin === undefined ? cinOf(i) : guess.cin;
  const rows: AiClaimRow[] = [
    ...(name === null ? [] : [claimRow({ kind: 'organisation', sha256, name, cin })]),
    claimRow({
      kind: 'amount',
      sha256,
      amount: { minor: guess.paise ?? paiseOf(i), currency: 'INR' },
    }),
  ];
  return extractionRecord({ sha256, case_type: guess.caseType ?? 'penalty', rows });
}

const GOLDEN = range(N).map((i) => golden(i));
/** Predictions where the first `wrong` documents get `bad(i)` and the rest are right. */
const withWrong = (wrong: number, bad: (i: number) => Guess): AiExtractionRecord[] =>
  range(N).map((i) => predicted(i, i < wrong ? bad(i) : {}));

describe('evaluate (AI extraction quality gate, B-52)', () => {
  it('passes a perfect extraction of 30 golden documents', () => {
    expect(
      evaluate(
        GOLDEN,
        withWrong(0, () => ({})),
      ),
    ).toEqual({
      documents: 30,
      covered: 30,
      organisations: { precision: 1, recall: 1 },
      cins: { precision: 1, recall: 1 },
      amounts: { precision: 1, recall: 1 },
      caseTypeAccuracy: 1,
      passed: true,
      reasons: [],
    });
  });

  it('needs at least 30 golden documents', () => {
    const report = evaluate(
      GOLDEN.slice(0, N - 1),
      withWrong(0, () => ({})),
    );
    expect(report.passed).toBe(false);
    expect(report.reasons).toEqual(['golden set has 29 documents; at least 30 needed']);
  });

  it('needs 90% coverage: 27 of 30 extracted passes, 26 fails', () => {
    const all = withWrong(0, () => ({}));
    expect(evaluate(GOLDEN, all.slice(0, 27)).passed).toBe(true);
    const low = evaluate(GOLDEN, all.slice(0, 26));
    expect(low).toMatchObject({ covered: 26, passed: false });
    expect(low.reasons).toEqual(['only 26 of 30 golden documents were extracted']);
  });

  it('gates organisation precision at 0.90 on normalised names', () => {
    const spelled = range(N).map((i) => predicted(i, { org: `M/s. Company ${i} Ltd.` }));
    expect(evaluate(GOLDEN, spelled).organisations.precision).toBe(1);
    const atGate = evaluate(
      GOLDEN,
      withWrong(3, () => ({ org: 'Other Holdings Limited' })),
    );
    expect(atGate.organisations.precision).toBe(0.9);
    expect(atGate.passed).toBe(true);
    const below = evaluate(
      GOLDEN,
      withWrong(4, (i) => ({ org: `Other ${i} Limited` })),
    );
    expect(below.reasons).toEqual(['organisation precision 0.87 < 0.9']);
  });

  it('gates CIN precision at 0.95', () => {
    const cins = (wrong: number): AiExtractionRecord[] =>
      range(N).map((i) =>
        predicted(i, { cin: i >= 20 ? null : i < wrong ? 'U00000DL2000PTC000000' : cinOf(i) }),
      );
    const atGate = evaluate(GOLDEN, cins(1));
    expect(atGate.cins.precision).toBe(0.95);
    expect(atGate.passed).toBe(true);
    expect(evaluate(GOLDEN, cins(2)).reasons).toEqual(['CIN precision 0.90 < 0.95']);
  });

  it('gates amount precision at 0.95 on integer paise, so rupee values count as wrong (B-01)', () => {
    const rupees = (i: number): Guess => ({ paise: paiseOf(i) / 100 });
    expect(evaluate(GOLDEN, withWrong(1, rupees)).passed).toBe(true);
    const below = evaluate(GOLDEN, withWrong(2, rupees));
    expect(below.amounts.precision).toBeCloseTo(28 / 30);
    expect(below.reasons).toEqual(['amount precision 0.93 < 0.95']);
  });

  it('reports recall and case-type accuracy without gating them', () => {
    const golden15 = range(N).map((i) => golden(i, { case_type: i < 15 ? null : 'penalty' }));
    const report = evaluate(
      golden15,
      range(N).map((i) =>
        predicted(i, { org: i % 2 === 0 ? null : orgName(i), caseType: 'insolvency' }),
      ),
    );
    expect(report.organisations).toEqual({ precision: 1, recall: 0.5 });
    expect(report.caseTypeAccuracy).toBe(0);
    expect(report.passed).toBe(true);
  });

  it('reports no precision for a metric with no predictions', () => {
    const report = evaluate(
      GOLDEN,
      range(N).map((i) => predicted(i, { org: null })),
    );
    expect(report.organisations).toEqual({ precision: null, recall: 0 });
    expect(report.cins).toEqual({ precision: null, recall: 0 });
  });

  it('ignores extractions of documents outside the golden set', () => {
    const extra = range(5).map((i) => predicted(100 + i, { org: 'Wrong Limited', paise: 1 }));
    expect(evaluate(GOLDEN, [...withWrong(0, () => ({})), ...extra]).passed).toBe(true);
  });

  it('readGolden parses lines, skipping blank and // comment lines, with defaults', async () => {
    const file = goldenFile([
      '// curated 2026-10',
      JSON.stringify({
        sha256: shaOf(1),
        organisations: [{ name: 'Example Finance Limited' }],
        amounts_paise: [62_700_000_000],
      }),
      '',
      JSON.stringify(golden(1)),
    ]);
    expect(await readGolden(file)).toEqual([
      {
        sha256: shaOf(1),
        organisations: [{ name: 'Example Finance Limited', cin: null }],
        amounts_paise: [62_700_000_000],
        case_type: null,
      },
      golden(1),
    ]);
  });

  it('readGolden names the file line of a bad entry (regression: skipped lines were not counted)', async () => {
    const bad = JSON.stringify({ ...golden(0), amounts_paise: [62.7] });
    const file = goldenFile(['// header', '', JSON.stringify(golden(1)), bad]);
    await expect(readGolden(file)).rejects.toThrow(`Invalid golden line 4 in ${file}`);
    await expect(readGolden(goldenFile(['{not json']))).rejects.toThrow('Invalid golden line 1');
  });
});

function goldenFile(lines: readonly string[]): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'fundtrace-golden-')), 'golden.jsonl');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}
