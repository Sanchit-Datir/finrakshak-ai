import type { AnalyseApplicationInput } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_LIMITS,
  AnalysisInputTooLarge,
  buildPrompt,
  ground,
  mockAnalysis,
  parseReply,
  scoreConsistent,
} from './applicationAnalysis.js';

const INPUT: AnalyseApplicationInput = {
  borrowerType: 'individual',
  attention: { score: 60, band: 'urgent', driverIds: ['X1'] },
  documents: [
    {
      docId: 'D1',
      docType: 'salary_slip',
      fields: [
        { fieldId: 'F1', label: 'Net pay', value: '42,000', reviewed: true },
        { fieldId: 'F2', label: 'Employer', value: 'SYNTH Mills', reviewed: false },
      ],
    },
  ],
  findings: [{ findingId: 'X1', title: 'Income mismatch', priority: 'urgent', observed: 'a' }],
};

describe('buildPrompt', () => {
  it('puts the application inside the data markers', () => {
    const p = buildPrompt(INPUT);
    const data = p.slice(p.indexOf('<<<APPLICATION_DATA'), p.indexOf('APPLICATION_DATA>>>'));
    expect(data).toContain('SYNTH Mills');
  });

  it('asks for a short summary and keeps the no-verdict and data-only rules', () => {
    const p = buildPrompt(INPUT);
    expect(p).toContain('2 or 3 plain sentences, at most 400 characters');
    expect(p).toContain('never say');
    expect(p).toContain('Use only the data between the markers');
  });

  it('refuses data over the prompt cap (B-10)', () => {
    const big = { ...INPUT, findings: [{ ...INPUT.findings[0], observed: 'x'.repeat(30_000) }] };
    expect(() => buildPrompt(big as AnalyseApplicationInput)).toThrow(AnalysisInputTooLarge);
  });
});

describe('parseReply (B-13)', () => {
  it('returns null for text that is not the expected JSON', () => {
    expect(parseReply('not json')).toBeNull();
    expect(parseReply('{"facts": "nope"}')).toBeNull();
  });
  it('fills missing lists with empty ones', () => {
    expect(parseReply('{"summary": "ok"}')).toEqual({ summary: 'ok', facts: [], findingNotes: [] });
  });
});

describe('ground', () => {
  const reply = (r: object): NonNullable<ReturnType<typeof parseReply>> => ({
    summary: '',
    facts: [],
    findingNotes: [],
    ...r,
  });

  it('keeps a fact only when it quotes a field that was sent', () => {
    const g = ground(
      INPUT,
      reply({
        facts: [
          { docId: 'D1', fieldId: 'F1', statement: 'Net pay is 42,000 a month' },
          { docId: 'D1', fieldId: 'F1', statement: 'Net pay is 90,000' },
          { docId: 'D1', fieldId: 'F9', statement: '42,000' },
          { docId: 'D2', fieldId: 'F1', statement: '42,000' },
        ],
      }),
    );
    expect(g.facts.map((f) => f.statement)).toEqual(['Net pay is 42,000 a month']);
    expect(g.dropped).toBe(3);
  });

  it('keeps one note per known finding and drops unknown ones', () => {
    const g = ground(
      INPUT,
      reply({
        findingNotes: [
          { findingId: 'X1', note: 'Ask for the last 3 slips.' },
          { findingId: 'X1', note: 'Again.' },
          { findingId: 'ZZ', note: 'Unknown.' },
        ],
      }),
    );
    expect(g.findingNotes).toEqual([{ findingId: 'X1', note: 'Ask for the last 3 slips.' }]);
    expect(g.dropped).toBe(2);
  });

  it('withholds verdict wording (B-58)', () => {
    const g = ground(
      INPUT,
      reply({
        summary: 'This looks like fraud.',
        findingNotes: [{ findingId: 'X1', note: 'The borrower is guilty.' }],
      }),
    );
    expect(g.summary).toBe('');
    expect(g.findingNotes).toEqual([]);
    expect(g.dropped).toBe(2);
  });

  it('clips long text and caps the number of facts', () => {
    const many = Array.from({ length: ANALYSIS_LIMITS.maxFacts + 5 }, () => ({
      docId: 'D1',
      fieldId: 'F1',
      statement: `42,000 ${'y'.repeat(400)}`,
    }));
    const g = ground(INPUT, reply({ facts: many, summary: 'z'.repeat(5_000) }));
    expect(g.facts).toHaveLength(ANALYSIS_LIMITS.maxFacts);
    expect(g.facts[0]?.statement.length).toBe(ANALYSIS_LIMITS.maxTextChars);
    expect(g.summary.length).toBe(ANALYSIS_LIMITS.summaryChars);
  });
});

describe('attention score wording', () => {
  const reply = (
    summary: string,
    note = 'Check it.',
  ): NonNullable<ReturnType<typeof parseReply>> => ({
    summary,
    facts: [],
    findingNotes: [{ findingId: 'X1', note }],
  });

  it('allows the code’s own score and withholds a different one', () => {
    expect(
      ground(INPUT, reply('Attention score 60/100, driven by the income mismatch.')).summary,
    ).not.toBe('');
    const other = ground(INPUT, reply('I would put this at 85 out of 100.', 'Score of 90.'));
    expect(other.summary).toBe('');
    expect(other.findingNotes).toEqual([]);
    expect(other.dropped).toBe(2);
  });

  it('withholds any stated score when the checks have not run', () => {
    const noScore = { ...INPUT, attention: null };
    expect(scoreConsistent(noScore, 'The score is 40.')).toBe(false);
    expect(scoreConsistent(noScore, 'Net pay is 42,000.')).toBe(true);
  });

  it('asks the model to explain the score, not to set one', () => {
    expect(buildPrompt(INPUT)).toContain('Never give a different score');
  });
});

describe('mockAnalysis', () => {
  it('is labelled and uses reviewed fields only', () => {
    const m = mockAnalysis(INPUT);
    expect(m.summary.startsWith('[mock]')).toBe(true);
    expect(m.facts).toEqual([{ docId: 'D1', fieldId: 'F1', statement: 'Net pay: 42,000' }]);
  });
  it('handles an empty application', () => {
    const m = mockAnalysis({ borrowerType: 'other', documents: [], findings: [], attention: null });
    expect(m.facts).toEqual([]);
    expect(m.findingNotes).toEqual([]);
  });
});
