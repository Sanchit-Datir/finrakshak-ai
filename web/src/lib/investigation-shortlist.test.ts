import type { GraphEdge, GraphLabBundle, GraphNode } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { indexBundle } from './graph-lab.js';
import { MIN_NAME_SCORE, nameScore, publicRelated, shortlist } from './investigation-shortlist.js';

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
  document_id: null,
  evidence_status: null,
  adverse_events: 0,
  seed_cases: [],
  hub: false,
  hub_roles: [],
  degree: 0,
});
const edge = (from: string, type: GraphEdge['type'], to: string): GraphEdge => ({
  id: `${from}-${type}-${to}`,
  from,
  to,
  type,
  basis: 'established',
  strength: 'strong',
  evidence_status: 'fact',
  source_id: 'synthetic',
  date: '2025-01-01',
  document_id: null,
  relationship_id: null,
  confidence: 0.9,
});
const bundle: GraphLabBundle = {
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
    node('k1', 'Kesari Agro Foods Private Limited', 'U01100MH2015PTC123456 · Under CIRP'),
    node('k2', 'Kesari Agro Food Pvt Ltd', 'U01100MH2016PTC999999 · Active'),
    node('k3', 'Kesary Agro Foods Limited', null),
    node('x', 'Unrelated Steel Limited', null),
    node('n1', 'Neighbour Mills Limited', 'U17110MH1990PTC000001 · Under Liquidation'),
    node('adr', '12 Market Yard, Pune, Maharashtra, 411037', 'maharashtra', 'address'),
    node('ev', 'CIRP of Kesari Agro Foods', 'IBBI · cirp initiated · ibbi_cirp', 'event'),
  ],
  edges: [
    edge('k1', 'named_in', 'ev'),
    edge('k1', 'registered_at', 'adr'),
    edge('n1', 'registered_at', 'adr'),
  ],
  documents: [],
  networks: [],
  identity: [],
};
const ix = indexBundle(bundle);
const q = { name: 'Kesari Agro Foods Pvt Ltd', cin: '', pincode: null, people: false };

describe('nameScore', () => {
  it('ignores common company words and tolerates small spelling differences', () => {
    expect(nameScore(['KESARI', 'AGRO', 'FOODS'], ['KESARI', 'AGRO', 'FOODS'])).toBe(100);
    expect(nameScore(['KESARI', 'AGRO', 'FOODS'], ['KESARY', 'AGRO', 'FOODS'])).toBe(100);
    expect(nameScore(['KESARI', 'AGRO'], ['UNRELATED', 'STEEL'])).toBe(0);
  });
});

describe('shortlist', () => {
  it('finds fuzzy name candidates, best first, and nothing below the threshold', () => {
    const ids = shortlist(ix, q).map((c) => c.candidateId);
    expect(ids).toContain('k1');
    expect(ids).toContain('k3');
    expect(ids).not.toContain('x');
    expect(shortlist(ix, q).every((c) => c.nameScore >= MIN_NAME_SCORE)).toBe(true);
  });

  it('never shortlists a company with a different CIN, and puts the same CIN first (B-37)', () => {
    const list = shortlist(ix, { ...q, cin: 'U01100MH2015PTC123456' });
    expect(list[0]).toMatchObject({ candidateId: 'k1', cinAgrees: true });
    expect(list.map((c) => c.candidateId)).not.toContain('k2');
  });

  it('carries records with their ids and compares the pincode', () => {
    const [k1] = shortlist(ix, { ...q, cin: 'U01100MH2015PTC123456', pincode: '411037' });
    expect(k1?.records).toEqual([
      {
        recordId: 'ev',
        kind: 'insolvency',
        date: '2025-01-01',
        title: 'CIRP of Kesari Agro Foods',
      },
    ]);
    expect(k1?.addressAgrees).toBe(true);
    const [other] = shortlist(ix, { ...q, cin: 'U01100MH2015PTC123456', pincode: '400001' });
    expect(other?.addressAgrees).toBe(false);
  });

  it('leaves the CIN check open when the applicant gave no CIN', () => {
    expect(shortlist(ix, q).every((c) => c.cinAgrees === null)).toBe(true);
  });
});

describe('publicRelated', () => {
  it('lists troubled companies at the same address as a confident candidate', () => {
    const list = shortlist(ix, { ...q, cin: 'U01100MH2015PTC123456' });
    expect(publicRelated(ix, list)).toEqual([
      expect.objectContaining({
        entityId: 'n1',
        source: 'public_records',
        concern: 'MCA status: Under Liquidation',
      }),
    ]);
  });

  it('follows no address from an unconfirmed candidate', () => {
    const fuzzy = shortlist(ix, q).filter((c) => c.candidateId === 'k3');
    expect(publicRelated(ix, fuzzy)).toEqual([]);
  });
});
