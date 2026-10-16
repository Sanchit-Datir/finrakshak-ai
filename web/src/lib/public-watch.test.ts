import type { GraphLabBundle, GraphNode } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import type { PublicWatch } from '../domain/schemas.js';
import { indexBundle } from './graph-lab.js';
import { checkWatch, watchFinding } from './public-watch.js';

// SYNTHETIC test graph: one fictional borrower with records before and after disbursement.
const event = (id: string, date: string, caseType: string): GraphNode => ({
  id,
  kind: 'event',
  label: `SYNTH ${caseType} ${date}`,
  detail: `X · status · ${caseType}`,
  sources: ['synthetic'],
  date,
  document_id: null,
  evidence_status: null,
  adverse_events: 0,
  seed_cases: [],
  hub: false,
  hub_roles: [],
  degree: 0,
});
const named = (to: string): GraphLabBundle['edges'][number] => ({
  id: `b-${to}`,
  from: 'b',
  to,
  type: 'named_in',
  basis: 'established',
  strength: 'strong',
  evidence_status: 'fact',
  source_id: 'ibbi',
  date: null,
  document_id: null,
  relationship_id: null,
  confidence: 0.9,
});
const ix = indexBundle({
  meta: {
    generated_at: '2026-10-16T00:00:00Z',
    synthetic: true,
    label: 'SYNTHETIC',
    dataset_built_at: null,
    thresholds: {},
    counts: {},
    notes: [],
  },
  nodes: [
    { ...event('b', '', ''), kind: 'company', label: 'SYNTH Borrower Pvt Ltd', detail: 'U05121MH2004PTC000001 · Active', date: null },
    event('e0', '2022-05-01', 'ed_search_seizure'),
    event('e1', '2023-11-16', 'ibbi_cirp'),
    event('e2', '2024-12-06', 'ibbi_liquidation'),
    event('e3', '2025-08-05', 'ed_search_seizure'),
  ],
  edges: ['e0', 'e1', 'e2', 'e3'].map(named),
  documents: [],
  networks: [],
  identity: [],
});

const watch = (events: PublicWatch['events'] = []): PublicWatch => ({
  id: 'W-1',
  loanId: null,
  loanRef: 'TEST-1',
  borrowerName: 'SYNTH Borrower Private Limited',
  cin: 'U05121MH2004PTC000001',
  amountMinor: null,
  disbursedOn: '2023-06-01',
  branchId: 'br',
  createdAt: '2023-06-01T00:00:00Z',
  createdBy: 'test',
  lastCheck: null,
  events,
  audit: [],
});
const dates = (w: PublicWatch, asOf: string): (string | null)[] =>
  checkWatch(ix, w, asOf, 'now').newEvents.map((e) => e.record.date);

describe('public-records watch', () => {
  it('raises only records after disbursement and up to the as-of date', () => {
    expect(dates(watch(), '2023-10-31')).toEqual([]);
    expect(dates(watch(), '2024-12-31')).toEqual(['2023-11-16', '2024-12-06']);
  });
  it('never raises the same record twice', () => {
    const first = checkWatch(ix, watch(), '2023-12-31', 'now').newEvents;
    expect(dates(watch(first), '2025-12-31')).toEqual(['2024-12-06', '2025-08-05']);
  });
  it('makes an urgent finding with the record as evidence', () => {
    const [ev] = checkWatch(ix, watch(), '2023-12-31', 'now').newEvents;
    if (ev === undefined) throw new Error('expected an event');
    const f = watchFinding(watch([ev]), ev);
    expect(f.priority).toBe('urgent');
    expect(f.title).toMatch(/taken to insolvency/);
  });
});
