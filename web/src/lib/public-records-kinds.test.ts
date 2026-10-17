import type { GraphEdge, GraphLabBundle, GraphNode } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { indexBundle } from './graph-lab.js';
import { isDistressed, lookupCompany } from './public-records.js';

/**
 * Characterisation tests for how public-records.ts turns a graph event's `case_type` into a record
 * kind (insolvency, liquidation, enforcement) and into the borrower's list of records. The mapping
 * is private, so it is pinned through `lookupCompany`. All companies are fictional ("SYNTH").
 */

const COMPANY = 'SYNTH Kinds Co Ltd';
const CIN = 'U00000MH2000PTC000001';

/** Every case_type the app turns into a record today, and the kind it becomes. */
const MAPPED: readonly (readonly [string, string])[] = [
  ['ibbi_cirp', 'insolvency'],
  ['ibbi_liquidation', 'liquidation'],
  ['ed_provisional_attachment', 'enforcement'],
  ['ed_search_seizure', 'enforcement'],
  ['ed_prosecution_complaint', 'enforcement'],
  ['ed_arrest', 'enforcement'],
  ['ed_conviction', 'enforcement'],
  ['ed_feo_declaration', 'enforcement'],
  ['sfio_conviction_list', 'enforcement'],
  ['sfio_proclaimed_offenders', 'enforcement'],
  ['sebi_final_order', 'enforcement'],
  ['sebi_interim_order', 'enforcement'],
  ['rbi_licence_cancellation', 'enforcement'],
  ['rbi_cor_cancellation', 'enforcement'],
];

/** Real case types in the pipeline that are deliberately NOT records for this check. */
const UNMAPPED = [
  'ibbi_voluntary_liquidation',
  'nfra_disciplinary_order',
  'nfra_inspection_report',
  'ed_press_release',
  'ed_restitution',
  'rbi_monetary_penalty',
  'rbi_section_35a_update',
  'rbi_press_release',
  'rbi_alert_list',
  'sfio_notice',
  'something_new_and_unknown',
];

const node = (
  id: string,
  label: string,
  detail: string | null,
  kind: GraphNode['kind'],
  date: string | null = null,
): GraphNode => ({
  id,
  kind,
  label,
  detail,
  sources: ['synthetic'],
  date,
  document_id: kind === 'event' ? `doc_${id}` : null,
  evidence_status: null,
  adverse_events: 0,
  seed_cases: [],
  hub: false,
  hub_roles: [],
  degree: 0,
});

const namedIn = (from: string, to: string, status = 'fact'): GraphEdge => ({
  id: `${from}-named_in-${to}`,
  from,
  to,
  type: 'named_in',
  basis: 'established',
  strength: 'strong',
  evidence_status: status,
  source_id: 'ibbi',
  date: null,
  document_id: `doc_${to}`,
  relationship_id: null,
  confidence: 0.9,
});

interface Ev {
  readonly caseType: string;
  readonly date?: string;
  readonly status?: string;
}

function lookup(
  events: readonly Ev[],
  extraEdges: readonly GraphEdge[] = [],
): ReturnType<typeof lookupCompany> {
  const company = node('co', COMPANY, `${CIN} · Active`, 'company');
  const evNodes = events.map((e, i) =>
    node(
      `ev${i}`,
      `Event ${i} ${e.caseType}`,
      `SRC · text · ${e.caseType}`,
      'event',
      e.date ?? '2025-01-01',
    ),
  );
  const bundle: GraphLabBundle = {
    meta: {
      generated_at: '2026-10-16T00:00:00Z',
      synthetic: true,
      label: 'SYNTHETIC',
      dataset_built_at: '2026-10-16T00:00:00Z',
      thresholds: {},
      counts: {},
      notes: [],
    },
    nodes: [company, ...evNodes],
    edges: [...events.map((e, i) => namedIn('co', `ev${i}`, e.status)), ...extraEdges],
    documents: [
      {
        id: 'doc_ev0',
        url: 'https://example.invalid/synthetic/ev0',
        title: 'Doc 0',
        date: null,
        source_id: 'ibbi',
      },
    ],
    networks: [],
    identity: [],
  };
  return lookupCompany(indexBundle(bundle), COMPANY, CIN);
}

describe('record kinds from case_type', () => {
  it.each(MAPPED)('turns %s into a %s record', (caseType, kind) => {
    const subject = lookup([{ caseType }]);
    expect(subject.match).toBe('cin');
    expect(subject.records.map((r) => [r.caseType, r.kind])).toEqual([[caseType, kind]]);
  });

  it.each(UNMAPPED)('does not make %s a record', (caseType) => {
    expect(lookup([{ caseType }]).records).toEqual([]);
  });

  it('maps exactly the 14 case types above and no others', () => {
    const all = [...MAPPED.map(([t]) => t), ...UNMAPPED];
    const recorded = lookup(all.map((caseType) => ({ caseType }))).records.map((r) => r.caseType);
    expect(new Set(recorded)).toEqual(new Set(MAPPED.map(([t]) => t)));
    expect(recorded).toHaveLength(MAPPED.length);
  });
});

describe('records of a subject', () => {
  it('lists newest first, keeps the evidence status and attaches the document link', () => {
    const subject = lookup([
      { caseType: 'ibbi_cirp', date: '2024-03-01', status: 'fact' },
      { caseType: 'ed_arrest', date: '2025-06-01', status: 'allegation' },
    ]);
    expect(subject.records.map((r) => [r.caseType, r.date, r.evidenceStatus])).toEqual([
      ['ed_arrest', '2025-06-01', 'allegation'],
      ['ibbi_cirp', '2024-03-01', 'fact'],
    ]);
    expect(subject.records.find((r) => r.caseType === 'ibbi_cirp')?.url).toBe(
      'https://example.invalid/synthetic/ev0',
    );
  });

  it('counts a repeated edge to the same event once', () => {
    const subject = lookup([{ caseType: 'ibbi_cirp' }], [namedIn('co', 'ev0')]);
    expect(subject.records).toHaveLength(1);
  });

  it('ignores a named_in edge that points at the company instead of leaving it', () => {
    const subject = lookup([], [namedIn('ev-elsewhere', 'co')]);
    expect(subject.records).toEqual([]);
  });

  it('is distressed with any record, and not distressed with none while the MCA status is Active', () => {
    expect(isDistressed(lookup([{ caseType: 'ed_arrest' }]))).toBe(true);
    expect(isDistressed(lookup([{ caseType: 'nfra_disciplinary_order' }]))).toBe(false);
  });

  it('treats MCA statuses that are not a going concern as distressed even without records', () => {
    for (const status of [
      'Under CIRP',
      'Under Liquidation',
      'Strike Off',
      'Dissolved',
      'Under process of striking off',
    ])
      expect(isDistressed({ ...lookup([]), mcaStatus: status }), status).toBe(true);
    expect(isDistressed({ ...lookup([]), mcaStatus: 'Active' })).toBe(false);
  });
});
