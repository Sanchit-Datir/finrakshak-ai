import { AnalyseApplicationInputSchema } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import type { ExtractedField, FtDocument } from '../domain/schemas.js';
import { analysisInputsKey, buildAnalysisRequest } from './application-analysis.js';
import { applicationDocs, runChecks } from './checks.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const app = db.applications.find((a) => applicationDocs(a, db).length > 0);
if (app === undefined) throw new Error('demo data has no application with documents');
const docs = applicationDocs(app, db);
const findings = runChecks(app, db);

const withFields = (doc: FtDocument, fields: Partial<ExtractedField>[]): FtDocument => {
  const base = doc.fields[0];
  if (base === undefined) throw new Error(`document ${doc.id} has no fields to copy`);
  return { ...doc, fields: fields.map((f, i) => ({ ...base, id: `T${String(i)}`, ...f })) };
};

describe('buildAnalysisRequest', () => {
  it('builds input the server schema accepts', () => {
    const { input } = buildAnalysisRequest(app, docs, findings);
    expect(AnalyseApplicationInputSchema.safeParse(input).success).toBe(true);
    expect(input.findings).toHaveLength(Math.min(findings.length, 25));
  });

  it('masks identifiers and leaves out unreadable or empty fields (B-16)', () => {
    const base = docs[0];
    if (base === undefined) throw new Error('no document');
    const doc = withFields(base, [
      { key: 'aadhaar_number', label: 'Aadhaar number', value: '1234 5678 9012', quality: 'clear' },
      { key: 'name', label: 'Name', value: 'SYNTH Asha', quality: 'clear' },
      { key: 'income', label: 'Income', value: '50,000', quality: 'unreadable' },
      { key: 'note', label: 'Note', value: '  ', quality: 'clear' },
    ]);
    const fields = buildAnalysisRequest(app, [doc], []).input.documents[0]?.fields ?? [];
    expect(fields.map((f) => f.value)).toEqual(['XXXX XXXX 9012', 'SYNTH Asha']);
  });

  it('leaves out documents that would not fit and counts them', () => {
    const base = docs[0];
    if (base === undefined) throw new Error('no document');
    const big = withFields(
      base,
      Array.from({ length: 30 }, () => ({ key: 'x', label: 'Long', value: 'v'.repeat(200) })),
    );
    const many = Array.from({ length: 12 }, (_, i) => ({ ...big, id: `D${String(i)}` }));
    const r = buildAnalysisRequest(app, many, []);
    expect(r.omittedDocuments).toBeGreaterThan(0);
    expect(r.input.documents.length + r.omittedDocuments).toBe(12);
    expect(JSON.stringify(r.input).length).toBeLessThanOrEqual(20_000);
  });

  it('handles an application with no documents and no findings', () => {
    const r = buildAnalysisRequest(app, [], []);
    expect(r).toEqual({
      input: { borrowerType: app.borrowerType, attention: null, documents: [], findings: [] },
      omittedDocuments: 0,
    });
  });

  it('sends the code-computed attention score with its drivers', () => {
    const attention = {
      score: 70,
      band: 'urgent',
      counted: 2,
      drivers: [{ findingId: 'X1', source: 'rule', title: 'T', priority: 'urgent', points: 60 }],
    } as const;
    const { input } = buildAnalysisRequest(app, [], [], attention);
    expect(input.attention).toEqual({ score: 70, band: 'urgent', driverIds: ['X1'] });
    expect(AnalyseApplicationInputSchema.safeParse(input).success).toBe(true);
  });
});

describe('analysisInputsKey', () => {
  it('is stable for the same data and changes when it changes', () => {
    const { input } = buildAnalysisRequest(app, docs, findings);
    expect(analysisInputsKey(input)).toBe(analysisInputsKey(structuredClone(input)));
    expect(analysisInputsKey({ ...input, findings: [] })).not.toBe(analysisInputsKey(input));
  });
});
