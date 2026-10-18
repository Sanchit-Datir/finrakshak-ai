import type { AnalyseApplicationResult, InvestigateApplicationResult } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import type { Finding } from './checks.js';
import {
  buildHeadline,
  documentLeads,
  MAX_LEADS,
  oneLine,
  rankLeads,
  recordLeads,
  runStatus,
  similarity,
  type Lead,
} from './ai-leads.js';

const finding = (id: string, title: string, priority: Finding['priority']): Finding => ({
  id,
  ruleId: id,
  title,
  category: 'document_inconsistency',
  priority,
  certainty: 'high',
  observed: `${title} observed`,
  whyItMatters: '',
  evidence: [{ label: 'Name', value: 'SYNTH Mills', docId: 'D1', fieldId: 'F1', appId: null }],
  known: [],
  unknown: [],
  benign: [],
  steps: [],
});

const analysis = (notes: { findingId: string; note: string }[]): AnalyseApplicationResult => ({
  mock: false,
  model: 'm',
  analysedAt: '2026-10-18T00:00:00.000Z',
  summary: '',
  facts: [{ docId: 'D1', fieldId: 'F1', statement: 'Name: SYNTH Mills' }],
  findingNotes: notes,
  dropped: 0,
  remainingToday: 20,
});

const lead = (id: string, priority: Lead['priority'], text: string, label = id): Lead => ({
  id,
  source: 'documents',
  priority,
  text,
  label,
  evidence: [],
});

describe('documentLeads', () => {
  it('turns finding notes into leads with the finding priority and quoted facts', () => {
    const f = finding('a', 'Name mismatch', 'urgent');
    const leads = documentLeads(analysis([{ findingId: 'a', note: 'Compare the PAN card.' }]), [f]);
    expect(leads).toHaveLength(1);
    expect(leads[0]?.priority).toBe('urgent');
    expect(leads[0]?.text).toBe('Name mismatch: Compare the PAN card.');
    expect(leads[0]?.evidence).toContain('Name: SYNTH Mills');
  });

  it('ignores notes for unknown findings and a missing analysis', () => {
    expect(documentLeads(analysis([{ findingId: 'zz', note: 'x' }]), [])).toEqual([]);
    expect(documentLeads(null, [])).toEqual([]);
  });
});

describe('recordLeads', () => {
  it('returns nothing without an investigation', () => {
    expect(recordLeads(null, {})).toEqual([]);
  });

  it('labels the kind and resolves citations through the evidence index', () => {
    const inv = {
      findings: [
        {
          id: 'f1',
          kind: 'public_record_match',
          priority: 'needs_attention',
          statement: 'May be Acme Ltd in the public records; needs verification.',
          partyId: 'p1',
          match: 'possible',
          citations: [{ type: 'record', id: 'r1' }],
        },
      ],
    } as unknown as InvestigateApplicationResult;
    const [l] = recordLeads(inv, { 'record:r1': { label: 'IBBI order', detail: 'liquidation' } });
    expect(l?.source).toBe('public_records');
    expect(l?.evidence).toEqual(['IBBI order: liquidation']);
  });
});

describe('rankLeads', () => {
  it('orders by priority and keeps input order within a priority', () => {
    const r = rankLeads([
      lead('a', 'routine', 'alpha alpha'),
      lead('b', 'urgent', 'bravo bravo'),
      lead('c', 'urgent', 'charlie charlie'),
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('drops a lead that repeats a better-ranked one', () => {
    const r = rankLeads([
      lead('a', 'routine', 'Director is linked to a company in liquidation'),
      lead('b', 'urgent', 'Director linked to company in liquidation (IBBI)'),
    ]);
    expect(r.map((x) => x.id)).toEqual(['b']);
  });

  it('keeps unrelated leads', () => {
    expect(
      rankLeads([lead('a', 'urgent', 'income too high'), lead('b', 'urgent', 'address differs')]),
    ).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('oneLine collapses whitespace and cuts long text on a word', () => {
    expect(oneLine('a   b\n c')).toBe('a b c');
    const cut = oneLine('word '.repeat(60), 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('similarity is 0 for empty text and 1 for contained text', () => {
    expect(similarity('', 'abc def')).toBe(0);
    expect(similarity('red fox', 'the red fox jumps')).toBe(1);
  });

  it('MAX_LEADS is 5', () => {
    expect(MAX_LEADS).toBe(5);
  });
});

describe('runStatus and buildHeadline', () => {
  it('names which half ran', () => {
    const a = analysis([]);
    const i = {} as InvestigateApplicationResult;
    expect([
      runStatus(a, i),
      runStatus(a, null),
      runStatus(null, i),
      runStatus(null, null),
    ]).toEqual(['both', 'documents', 'investigator', 'none']);
  });

  it('builds 2-3 sentences from the leads with the app’s priority wording', () => {
    const h = buildHeadline(
      [lead('a', 'urgent', 'Name differs.'), lead('b', 'routine', 'Minor gap')],
      'both',
    );
    expect(h).toBe(
      '2 leads for review (1 Urgent review, 1 Routine review). Top lead: Name differs.',
    );
    expect(h).not.toMatch(/fraud/i);
  });

  it('says so when nothing was raised or one half is missing', () => {
    expect(buildHeadline([], 'both')).toBe('The AI raised no lead for review.');
    expect(buildHeadline([lead('a', 'urgent', 'x y z')], 'documents')).toContain(
      'The public-record investigation did not run.',
    );
    expect(buildHeadline([lead('a', 'urgent', 'x y z')], 'investigator')).toContain(
      'The document analysis did not run.',
    );
    expect(buildHeadline([], 'none')).toBe('');
  });
});
