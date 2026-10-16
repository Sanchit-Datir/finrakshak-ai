import type { EvidenceClaim, Relationship, RelationshipType } from '@fund-tracker/shared';
import { stableId } from '../util/ids.js';
import type { DatasetCollector, PendingOrg, PendingPerson } from './collector.js';

const ORIGIN_CONFIDENCE = { listing_field: 0.95, title: 0.85, text: 0.5 } as const;
const MAX_COMENTION_GROUP = 12;

interface Edge {
  readonly from: string;
  readonly type: RelationshipType;
  readonly to: string;
  readonly m: { documentId: string; source: PendingOrg['source']; date: string | null };
  readonly status: Relationship['evidence_status'];
  readonly confidence: number;
}

function toRelationship(e: Edge): Relationship {
  return {
    relationship_id: stableId('rel', e.from, e.type, e.to, e.m.documentId),
    from_id: e.from,
    relationship_type: e.type,
    to_id: e.to,
    valid_from: e.m.date,
    valid_to: null,
    first_observed_at: e.m.date,
    source_id: e.m.source,
    document_id: e.m.documentId,
    evidence_status: e.status,
    confidence: e.confidence,
  };
}

function orgEdges(c: DatasetCollector, o: PendingOrg): Edge[] {
  const id = c.registry.entityId(o.key);
  const edges: Edge[] = [
    {
      from: id,
      type: 'NAMED_IN_PROCEEDING',
      to: o.eventId,
      m: o,
      status: o.status,
      confidence: ORIGIN_CONFIDENCE[o.origin],
    },
  ];
  for (const subject of o.subjectKeys) {
    const to = c.registry.entityId(subject);
    if (to === id) continue;
    if (o.role === 'insolvency_applicant')
      edges.push({
        from: id,
        type: 'INSOLVENCY_APPLICANT_AGAINST',
        to,
        m: o,
        status: 'fact',
        confidence: 0.9,
      });
    if (o.role === 'audit_firm')
      edges.push({ from: id, type: 'AUDITOR_OF', to, m: o, status: 'fact', confidence: 0.6 });
  }
  return edges;
}

function personEdges(c: DatasetCollector, p: PendingPerson): Edge[] {
  const type: RelationshipType =
    p.role === 'insolvency_professional' ? 'INSOLVENCY_PROFESSIONAL_FOR' : 'AUDIT_PARTNER_FOR';
  return p.subjectKeys.map((k) => ({
    from: p.personId,
    type,
    to: c.registry.entityId(k),
    m: p,
    status: 'fact' as const,
    confidence: 0.85,
  }));
}

function coMentionEdges(c: DatasetCollector): Edge[] {
  const byEvent = new Map<string, { ids: Set<string>; m: PendingOrg }>();
  for (const o of c.orgs) {
    const g = byEvent.get(o.eventId) ?? { ids: new Set<string>(), m: o };
    g.ids.add(c.registry.entityId(o.key));
    byEvent.set(o.eventId, g);
  }
  const edges: Edge[] = [];
  for (const { ids, m } of byEvent.values()) {
    const list = [...ids].sort();
    if (list.length < 2 || list.length > MAX_COMENTION_GROUP) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const from = list[i];
        const to = list[j];
        if (from && to)
          edges.push({
            from,
            type: 'CO_MENTIONED_WITH',
            to,
            m,
            status: 'inference',
            confidence: 0.3,
          });
      }
    }
  }
  return edges;
}

export function buildRelationships(c: DatasetCollector): Relationship[] {
  const edges = [
    ...c.orgs.flatMap((o) => orgEdges(c, o)),
    ...c.persons.flatMap((p) => personEdges(c, p)),
    ...coMentionEdges(c),
  ];
  const byId = new Map<string, Relationship>();
  for (const e of edges) {
    const r = toRelationship(e);
    const prev = byId.get(r.relationship_id);
    if (!prev || prev.confidence < r.confidence) byId.set(r.relationship_id, r);
  }
  return [...byId.values()];
}

/** Mention, role and identifier claims (amount claims were added during collection). */
export function buildClaims(c: DatasetCollector): EvidenceClaim[] {
  const out = [...c.claims];
  for (const o of c.orgs) {
    const predicate =
      o.origin === 'text' && o.role === 'mentioned'
        ? 'mentioned_in_document'
        : `named_as_${o.role}`;
    const method = o.origin === 'listing_field' ? 'listing_field' : 'regex';
    out.push(
      c.claim(
        c.registry.entityId(o.key),
        predicate,
        o.eventId,
        o,
        o.documentId,
        o.source,
        o.page,
        o.origin === 'text' ? 'fact' : o.status,
        method,
        ORIGIN_CONFIDENCE[o.origin],
      ),
    );
  }
  for (const p of c.persons) {
    out.push(
      c.claim(
        p.personId,
        `named_as_${p.role}`,
        p.eventId,
        p,
        p.documentId,
        p.source,
        null,
        'fact',
        p.source === 'ibbi' ? 'listing_field' : 'regex',
        0.85,
      ),
    );
  }
  for (const b of c.cinBindings) {
    out.push(
      c.claim(
        c.registry.entityId(b.key),
        'has_cin',
        b.cin,
        b,
        b.documentId,
        b.source,
        b.page,
        'fact',
        'regex',
        b.source === 'ibbi' ? 0.9 : 0.7,
      ),
    );
  }
  const byId = new Map(out.map((cl) => [cl.claim_id, cl]));
  return [...byId.values()];
}
