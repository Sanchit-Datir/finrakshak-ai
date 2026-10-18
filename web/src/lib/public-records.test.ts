import type { GraphEdge, GraphLabBundle, GraphNode } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import type { Application, TradeCustomer } from '../domain/schemas.js';
import { indexBundle } from './graph-lab.js';
import { checkPublicRecords, normalizeCompanyName } from './public-records.js';
import { publicRecordsFindings } from './public-records-findings.js';
import { parseCustomerRows, receivablesImpact } from './receivables.js';

// SYNTHETIC test graph: fictional "SYNTH" companies, not real public records.
const node = (
  id: string,
  label: string,
  detail: string | null,
  kind: GraphNode['kind'] = 'company',
): GraphNode => ({
  id,
  kind,
  label,
  detail,
  sources: ['synthetic'],
  date: kind === 'event' ? '2025-01-01' : null,
  document_id: kind === 'event' ? `doc_${id}` : null,
  evidence_status: null,
  adverse_events: 0,
  seed_cases: [],
  hub: false,
  hub_roles: [],
  degree: 0,
});
const edge = (from: string, type: GraphEdge['type'], to: string, date: string): GraphEdge => ({
  id: `${from}-${type}-${to}`,
  from,
  to,
  type,
  basis: 'established',
  strength: 'strong',
  evidence_status: 'fact',
  source_id: 'ibbi',
  date,
  document_id: `doc_${from}_${to}`,
  relationship_id: null,
  confidence: 0.9,
});
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
  nodes: [
    node('a', 'SYNTH Applicant Traders Pvt Ltd', null),
    node('b', 'SYNTH Buyer Alloys Private Limited', 'U27100MH1995PTC000001 · Under Liquidation'),
    node('c', 'SYNTH Middle Steel Traders Pvt Ltd', null),
    node('d', 'SYNTH End Strips Pvt Ltd', null),
    node('t1', 'SYNTH Twin Co Ltd', null),
    node('t2', 'SYNTH Twin Co Ltd', null),
    node('f', 'SYNTH Other Co Ltd', 'U11111MH2000PTC000002 · Active'),
    node(
      'evb',
      'Liquidation of SYNTH Buyer Alloys',
      'IBBI · liquidation · ibbi_liquidation',
      'event',
    ),
    node('evc', 'CIRP of SYNTH Middle Steel', 'IBBI · cirp initiated · ibbi_cirp', 'event'),
  ],
  edges: [
    edge('a', 'insolvency_applicant_against', 'b', '2026-04-25'),
    edge('b', 'insolvency_applicant_against', 'c', '2025-02-22'),
    edge('c', 'insolvency_applicant_against', 'd', '2024-07-02'),
    edge('b', 'named_in', 'evb', '2025-06-01'),
    edge('c', 'named_in', 'evc', '2025-02-22'),
  ],
  documents: [],
  networks: [],
  identity: [],
};
const ix = indexBundle(bundle);
const demoApps = createDemoDb(new Date('2026-10-15T06:00:00Z')).applications;
function baseApp(): Application {
  const first = demoApps[0];
  if (first === undefined) throw new Error('demo data has no application');
  return structuredClone(first);
}

const customer = (name: string, rupees: number, cin = ''): TradeCustomer => ({
  name,
  cin,
  outstandingMinor: rupees * 100,
  oldestUnpaidDate: '',
});
function appWith(customers: TradeCustomer[]): Application {
  const app = baseApp();
  app.data.business = {
    ...app.data.business,
    businessName: 'SYNTH Applicant Traders Private Limited',
    registrationNo: '',
  };
  app.data.receivables = { customers };
  app.publicRecords = checkPublicRecords(ix, app.data, '2026-10-16T00:00:00Z');
  return app;
}

describe('public-records matching (B-37)', () => {
  it('normalises company suffixes and prefixes', () => {
    expect(normalizeCompanyName('M/s. Buyer Alloys Pvt. Ltd.')).toBe(
      'BUYER ALLOYS PRIVATE LIMITED',
    );
  });
  it('matches by CIN, exact name, flags ambiguity, and never across different CINs', () => {
    const snap = appWith([
      customer('anything', 1, 'U27100MH1995PTC000001'),
      customer('SYNTH Twin Co Limited', 1),
      customer('SYNTH Other Co Ltd', 1, 'U99999MH2000PTC999999'),
      customer('SYNTH Middle Steel Traders Private Limited', 1),
    ]).publicRecords;
    expect(snap?.customersChecked.map((c) => c.match)).toEqual([
      'cin',
      'ambiguous',
      'none',
      'exact_name',
    ]);
  });
});

describe('chain of unpaid dues', () => {
  it('follows documented insolvency links from a customer in liquidation', () => {
    const x = appWith([customer('SYNTH Buyer Alloys Pvt Ltd', 1_800_000)]).publicRecords
      ?.exposures[0];
    expect(x?.declared).toBe(true);
    expect(x?.applicantLink?.date).toBe('2026-04-25');
    expect(x?.chain.map((l) => l.debtor)).toEqual([
      'SYNTH Middle Steel Traders Pvt Ltd',
      'SYNTH End Strips Pvt Ltd',
    ]);
  });
  it('finds an undeclared customer through the applicant’s own insolvency application', () => {
    const x = appWith([]).publicRecords?.exposures[0];
    expect(x?.declared).toBe(false);
    expect(x?.customer.match).toBe('via_applicant_record');
  });
});

describe('findings and priority', () => {
  const priorityOf = (app: Application): string | undefined =>
    publicRecordsFindings(app).find((f) => f.category === 'counterparty_exposure')?.priority;
  it('is urgent when the stuck receivable is a large share, needs attention when small', () => {
    expect(
      priorityOf(
        appWith([
          customer('SYNTH Buyer Alloys Pvt Ltd', 1_800_000),
          customer('Clean Buyer', 3_200_000),
        ]),
      ),
    ).toBe('urgent');
    expect(
      priorityOf(
        appWith([
          customer('SYNTH Buyer Alloys Pvt Ltd', 500_000),
          customer('Clean Buyer', 4_500_000),
        ]),
      ),
    ).toBe('needs_attention');
  });
  it('is urgent when the applicant did not declare the customer', () => {
    expect(priorityOf(appWith([customer('Clean Buyer', 100)]))).toBe('urgent');
  });
  it('asks for a re-run when customers change after the check', () => {
    const app = appWith([customer('SYNTH Buyer Alloys Pvt Ltd', 1)]);
    app.data.receivables.customers.push(customer('New Buyer', 1));
    expect(publicRecordsFindings(app).some((f) => f.id === 'pr:not-current')).toBe(true);
  });
});

describe('receivables input (B-25, B-03)', () => {
  it('drops blank rows and reports invalid CINs per row', () => {
    const r = parseCustomerRows([
      { name: '', cin: '', outstanding: '', oldestUnpaidDate: '' },
      { name: 'X', cin: 'NOT-A-CIN', outstanding: '10', oldestUnpaidDate: '' },
    ]);
    expect(r.customers).toHaveLength(0);
    expect(Object.keys(r.errors)).toEqual(['1']);
  });
  it('refuses to total amounts beyond the safe-integer range', () => {
    const big = {
      name: 'X',
      cin: '',
      outstandingMinor: Number.MAX_SAFE_INTEGER,
      oldestUnpaidDate: '',
    };
    expect(receivablesImpact([big, big], () => false)).toBeNull();
  });
});
