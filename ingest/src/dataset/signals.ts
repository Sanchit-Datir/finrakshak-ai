import type { CaseEvent, Relationship, RiskSignal, SourceId } from '@fund-tracker/shared';
import { stableId } from '../util/ids.js';

interface EntityEvents {
  readonly events: CaseEvent[];
  readonly sources: Set<SourceId>;
}

const INSOLVENCY = new Set(['ibbi_cirp', 'ibbi_fast_track_cirp', 'ibbi_liquidation']);
const ENFORCEMENT_SOURCES = new Set<SourceId>(['sebi', 'ed', 'rbi', 'nfra', 'sfio']);
const BENIGN: Readonly<Record<string, string[]>> = {
  cross_source_presence: [
    'Large groups are named in many routine regulatory documents.',
    'Same name may refer to different companies until verified by CIN.',
  ],
  multiple_adverse_proceedings: [
    'Several orders can relate to one underlying matter (interim, final, appeal).',
  ],
  insolvency_after_enforcement: [
    'Insolvency often follows business distress unrelated to the earlier action.',
    'Event dates are publication dates, not dates of the underlying conduct.',
  ],
  seed_case_network: ['Co-mention in one document does not establish a business relationship.'],
  nfra_reporting_finding: [
    'NFRA findings concern the auditor/reporting quality; they are not findings of fraud by the company.',
  ],
};

function signal(
  subject: string,
  type: string,
  value: number,
  explanation: string,
  events: readonly CaseEvent[],
  date: string | null,
): RiskSignal {
  return {
    signal_id: stableId('sig', subject, type),
    subject_id: subject,
    signal_type: type,
    value,
    explanation,
    feature_date: date,
    document_ids: [...new Set(events.map((e) => e.document_id))].slice(0, 20),
    benign_explanations: BENIGN[type] ?? [],
    review_status: 'unreviewed',
  };
}

function eventsByEntity(
  rels: readonly Relationship[],
  events: ReadonlyMap<string, CaseEvent>,
): Map<string, EntityEvents> {
  const out = new Map<string, EntityEvents>();
  for (const r of rels) {
    if (r.relationship_type !== 'NAMED_IN_PROCEEDING' || r.evidence_status === 'inference')
      continue;
    const e = events.get(r.to_id);
    if (!e) continue;
    const acc = out.get(r.from_id) ?? { events: [], sources: new Set<SourceId>() };
    acc.events.push(e);
    acc.sources.add(e.source_id);
    out.set(r.from_id, acc);
  }
  return out;
}

function latest(events: readonly CaseEvent[]): string | null {
  return (
    events
      .map((e) => e.publication_date ?? '')
      .sort()
      .at(-1) ?? null
  );
}

function entitySignals(id: string, acc: EntityEvents, adverse: ReadonlySet<string>): RiskSignal[] {
  const out: RiskSignal[] = [];
  const bad = acc.events.filter((e) => adverse.has(e.case_type));
  const badSources = new Set(bad.map((e) => e.source_id));
  if (badSources.size >= 2) {
    out.push(
      signal(
        id,
        'cross_source_presence',
        badSources.size,
        `Named in adverse records of ${badSources.size} sources: ${[...badSources].join(', ')}.`,
        bad,
        latest(bad),
      ),
    );
  }
  if (bad.length >= 3) {
    out.push(
      signal(
        id,
        'multiple_adverse_proceedings',
        bad.length,
        `Named in ${bad.length} adverse proceedings/actions.`,
        bad,
        latest(bad),
      ),
    );
  }
  const insol = bad
    .filter((e) => INSOLVENCY.has(e.case_type) && e.publication_date)
    .sort((a, b) => (a.publication_date ?? '').localeCompare(b.publication_date ?? ''))[0];
  const prior = bad.filter(
    (e) =>
      ENFORCEMENT_SOURCES.has(e.source_id) &&
      e.publication_date &&
      insol?.publication_date &&
      e.publication_date < insol.publication_date,
  );
  if (insol?.publication_date && prior.length > 0) {
    const first = prior.map((e) => e.publication_date ?? '').sort()[0] ?? '';
    const days = Math.round((Date.parse(insol.publication_date) - Date.parse(first)) / 86_400_000);
    out.push(
      signal(
        id,
        'insolvency_after_enforcement',
        days,
        `Insolvency announcement on ${insol.publication_date} followed ${prior.length} enforcement/regulatory record(s) from ${first} (${days} days earlier).`,
        [...prior, insol],
        insol.publication_date,
      ),
    );
  }
  const nfra = bad.filter((e) => e.source_id === 'nfra');
  if (nfra.length > 0) {
    out.push(
      signal(
        id,
        'nfra_reporting_finding',
        nfra.length,
        `Subject of ${nfra.length} NFRA order/review(s) on audit or financial reporting quality.`,
        nfra,
        latest(nfra),
      ),
    );
  }
  return out;
}

function seedNetworkSignals(
  rels: readonly Relationship[],
  seedEntities: ReadonlySet<string>,
  events: ReadonlyMap<string, CaseEvent>,
): RiskSignal[] {
  const byDocument = new Map([...events.values()].map((e) => [e.document_id, e]));
  const shared = new Map<string, CaseEvent[]>();
  for (const r of rels) {
    if (r.relationship_type !== 'CO_MENTIONED_WITH') continue;
    const [inSeed, other] = seedEntities.has(r.from_id)
      ? [r.from_id, r.to_id]
      : [r.to_id, r.from_id];
    if (!seedEntities.has(inSeed) || seedEntities.has(other)) continue;
    const evt = byDocument.get(r.document_id);
    shared.set(other, [...(shared.get(other) ?? []), ...(evt ? [evt] : [])]);
  }
  return [...shared].map(([id, evts]) =>
    signal(
      id,
      'seed_case_network',
      evts.length,
      `Co-mentioned with a seed-case entity in ${evts.length} document(s).`,
      evts,
      latest(evts),
    ),
  );
}

const MAX_ADDRESS_GROUP = 50;

/** Brief pattern "connected borrower cluster": entities sharing an address with an adversely named entity. */
function sharedAddressSignals(
  rels: readonly Relationship[],
  adverseIds: ReadonlySet<string>,
): RiskSignal[] {
  const byAddress = new Map<string, string[]>();
  for (const r of rels) {
    if (r.relationship_type === 'REGISTERED_AT')
      byAddress.set(r.to_id, [...(byAddress.get(r.to_id) ?? []), r.from_id]);
  }
  const out: RiskSignal[] = [];
  for (const [address, ids] of byAddress) {
    const unique = [...new Set(ids)];
    const flagged = unique.filter((id) => adverseIds.has(id));
    if (unique.length < 2 || unique.length > MAX_ADDRESS_GROUP || flagged.length === 0) continue;
    for (const id of unique) {
      const others = flagged.filter((f) => f !== id);
      if (others.length === 0) continue;
      out.push({
        ...signal(
          id,
          'shared_registered_address',
          others.length,
          `Shares registered address ${address} with ${others.length} entity(ies) named in adverse records: ${others.slice(0, 5).join(', ')}.`,
          [],
          null,
        ),
        document_ids: ['doc_mca_company_master'],
      });
    }
  }
  return out;
}

export function buildSignals(
  rels: readonly Relationship[],
  events: readonly CaseEvent[],
  adverseTypes: ReadonlySet<string>,
  seedEntities: ReadonlySet<string>,
): RiskSignal[] {
  const byId = new Map(events.map((e) => [e.event_id, e]));
  const out: RiskSignal[] = [];
  const byEntity = eventsByEntity(rels, byId);
  for (const [id, acc] of byEntity) out.push(...entitySignals(id, acc, adverseTypes));
  out.push(...seedNetworkSignals(rels, seedEntities, byId));
  const adverseIds = new Set(
    [...byEntity]
      .filter(([, a]) => a.events.some((e) => adverseTypes.has(e.case_type)))
      .map(([id]) => id),
  );
  out.push(...sharedAddressSignals(rels, adverseIds));
  return out;
}
