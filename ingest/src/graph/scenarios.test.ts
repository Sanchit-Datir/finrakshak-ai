import { buildAdjacency, shortestPath, type GraphLabBundle } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { buildGraph } from './bundle.js';
import { computeInsights } from './insights.js';
import { renderReport } from './report.js';
import { scenarioInput } from './scenarios.js';

// SYNTHETIC TEST DATA: fictional "SYNTH" organisations exercising benign and ambiguous patterns.
const g: GraphLabBundle = buildGraph(scenarioInput(), { synthetic: true, label: 'scenarios' });
const id = (slug: string): string => `ent_synth_${slug}`;
const networkOf = (entity: string): GraphLabBundle['networks'][number] | undefined =>
  g.networks.find((n) => n.node_ids.includes(entity));
const together = (a: string, b: string): boolean => networkOf(a)?.node_ids.includes(b) ?? false;

describe('graph-lab synthetic scenarios', () => {
  it('labels the bundle as synthetic', () => {
    expect(g.meta.synthetic).toBe(true);
    expect(g.meta.notes[0]).toMatch(/SYNTHETIC/);
  });

  it('S1 benign shared address: low-score network with no adverse organisations', () => {
    const n = networkOf(id('alpha'));
    expect(n?.organisation_count).toBe(3);
    expect(n?.adverse_organisation_count).toBe(0);
    expect(n?.score).toBe(1);
    expect(n?.summary).toMatch(/not evidence of wrongdoing/);
  });

  it('S2 service-address hub links nobody', () => {
    expect(g.nodes.find((x) => x.id === 'adr_synth_service')?.hub).toBe(true);
    expect(networkOf(id('svc1'))).toBeUndefined();
    expect(g.identity.some((x) => [x.a, x.b].includes(id('svc1')))).toBe(false);
  });

  it('S3 large-bank creditor hub does not chain its debtors', () => {
    expect(g.nodes.find((x) => x.id === id('bank'))?.hub).toBe(true);
    expect(together(id('debtor1'), id('debtor2'))).toBe(false);
  });

  it('S4 a specific (non-hub) applicant links its two debtors through established edges', () => {
    expect(together(id('ka'), id('la'))).toBe(true);
    const edges = g.edges.filter((e) => e.from === id('lender'));
    expect(edges.every((e) => e.basis === 'established' && e.strength === 'strong')).toBe(true);
  });

  it('S5 similar names stay separate and appear only as an identity candidate', () => {
    expect(g.nodes.filter((x) => x.label.includes('Shree Ganesh'))).toHaveLength(2);
    const c = g.identity.find((x) => [x.a, x.b].includes(id('sg1')));
    expect(c?.status).toBe('needs_review');
    expect(together(id('sg1'), id('sg2'))).toBe(false);
  });

  it('S10 group companies: linked by their address, never proposed as the same entity', () => {
    expect(together(id('grp1'), id('grp2'))).toBe(true);
    expect(g.identity.some((x) => [x.a, x.b].includes(id('grp1')))).toBe(false);
  });

  it('S6 same-name co-operative banks in different towns are neither merged nor proposed', () => {
    expect(g.nodes.filter((x) => x.label.includes('Urban Co-operative'))).toHaveLength(2);
    expect(g.identity.some((x) => [x.a, x.b].includes(id('ucb1')))).toBe(false);
  });

  it('S7 documented co-party: linked through the order, with a path and a cited document', () => {
    expect(together(id('delta'), id('epsilon'))).toBe(true);
    const path = shortestPath(
      buildAdjacency(g.edges, { includeWeak: false }),
      id('delta'),
      id('epsilon'),
    );
    expect(path?.map((s) => s.to)).toEqual(['evt_synth_order', id('epsilon')]);
    expect(path?.every((s) => g.documents.some((d) => d.id === s.edge.document_id))).toBe(true);
  });

  it('S8 a text-only mention is a weak candidate, not a network member', () => {
    const e = g.edges.find((x) => x.from === id('eta'));
    expect(e).toMatchObject({ type: 'mentioned_in', basis: 'candidate', strength: 'weak' });
    expect(together(id('zeta'), id('eta'))).toBe(false);
  });

  it('S9 a batch notice is a hub and links none of the listed NBFCs', () => {
    expect(g.nodes.find((x) => x.id === 'evt_synth_batch')?.hub).toBe(true);
    expect(networkOf(id('nbfc1'))).toBeUndefined();
  });

  it('never states or implies a fraud finding in generated text', () => {
    const text = [renderReport(g, computeInsights(g)), ...g.networks.map((n) => n.summary)].join(
      '\n',
    );
    expect(text).not.toMatch(/\b(is|are|was|were|committed|confirmed|proven)\s+(a\s+)?fraud/i);
    expect(text).toMatch(/not evidence of (wrongdoing|fraud)/i);
  });

  it('is deterministic: rebuilding gives the same ids', () => {
    const again = buildGraph(scenarioInput(), { synthetic: true, label: 'scenarios' });
    expect(again.edges.map((e) => e.id)).toEqual(g.edges.map((e) => e.id));
    expect(again.networks.map((n) => n.id)).toEqual(g.networks.map((n) => n.id));
  });
});
