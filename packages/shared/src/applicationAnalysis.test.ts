import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ANALYSIS_LIMITS as L,
  AnalyseApplicationInputSchema,
  AnalyseApplicationResultSchema,
} from './applicationAnalysis.js';

const field = { fieldId: 'F1', label: 'Name', value: 'SYNTH Asha', reviewed: true };
const doc = { docId: 'D1', docType: 'pan', fields: [field] };

describe('analyseApplication schemas', () => {
  it('accepts an empty application (no documents, no findings)', () => {
    expect(
      AnalyseApplicationInputSchema.safeParse({
        borrowerType: 'individual',
        documents: [],
        findings: [],
      }).success,
    ).toBe(true);
  });

  it('rejects more documents or longer values than the limits', () => {
    const many = Array.from({ length: L.maxDocuments + 1 }, () => doc);
    const long = { ...doc, fields: [{ ...field, value: 'x'.repeat(L.maxValueChars + 1) }] };
    for (const documents of [many, [long]])
      expect(
        AnalyseApplicationInputSchema.safeParse({
          borrowerType: 'individual',
          documents,
          findings: [],
        }).success,
      ).toBe(false);
  });

  it('rejects a malformed result', () => {
    expect(AnalyseApplicationResultSchema.safeParse({ mock: true }).success).toBe(false);
    expect(
      AnalyseApplicationResultSchema.safeParse({
        mock: true,
        model: null,
        analysedAt: '2026-10-18T00:00:00.000Z',
        summary: '',
        facts: [],
        findingNotes: [],
        dropped: -1,
        remainingToday: null,
      }).success,
    ).toBe(false);
  });
});
