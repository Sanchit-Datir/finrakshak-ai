import type {
  Address,
  CaseEvent,
  DocumentRecord,
  Entity,
  EntityMatchCandidate,
  EvidenceStatus,
  Person,
  Relationship,
  RelationshipType,
  SourceId,
} from '@finrakshak-ai/shared';
import type { GraphInput } from './input.js';

export { SCENARIOS, scenarioNotes } from './scenarioList.js';

const DATE = '2026-01-15';
const url = (id: string): string => `https://example.invalid/synthetic/${id}`;

function entity(id: string, name: string, type: Entity['entity_type'] = 'company'): Entity {
  return {
    entity_id: `ent_synth_${id}`,
    entity_type: type,
    canonical_name: `SYNTH ${name}`,
    cin: null,
    status: null,
    incorporation_date: null,
    jurisdiction: 'IN',
    aliases: [],
    match_method: 'normalized_name',
    sources: ['mca_ogd'],
    mention_count: 1,
  };
}

function doc(id: string, source: SourceId, title: string): DocumentRecord {
  return {
    document_id: `doc_synth_${id}`,
    source_id: source,
    collection: 'synthetic',
    item_id: `item_synth_${id}`,
    url: url(id),
    title,
    publication_date: DATE,
    retrieval_date: null,
    checksum_sha256: null,
    file_location: null,
    content_type: null,
    text_chars: 0,
    page_count: 0,
    terms_note: 'SYNTHETIC TEST DATA',
  };
}

function event(id: string, source: SourceId, caseType: string, title: string): CaseEvent {
  return {
    event_id: `evt_synth_${id}`,
    case_type: caseType,
    authority: 'SYNTHETIC',
    source_id: source,
    document_id: `doc_synth_${id}`,
    title: `SYNTH ${title}`,
    party_names: [],
    event_date: DATE,
    publication_date: DATE,
    proceeding_status: 'synthetic',
    outcome: null,
    appeal_status: null,
    amounts: [],
  };
}

let seq = 0;
function rel(
  from: string,
  type: RelationshipType,
  to: string,
  docId: string,
  status: EvidenceStatus = 'fact',
  source: SourceId = 'mca_ogd',
): Relationship {
  seq++;
  return {
    relationship_id: `rel_synth_${seq}`,
    from_id: from,
    relationship_type: type,
    to_id: to,
    valid_from: DATE,
    valid_to: null,
    first_observed_at: DATE,
    source_id: source,
    document_id: docId,
    evidence_status: status,
    confidence: status === 'inference' ? 0.5 : 0.9,
  };
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Builds the scenario dataset in the same shape as data/processed. */
export function scenarioInput(): GraphInput {
  seq = 0;
  const ents: Entity[] = [];
  const add = (...es: Entity[]): string[] =>
    es.map((e) => {
      ents.push(e);
      return e.entity_id;
    });
  const s1 = add(
    entity('alpha', 'Alpha Traders Pvt Ltd'),
    entity('beta', 'Beta Foods Pvt Ltd'),
    entity('gamma', 'Gamma Design LLP', 'llp'),
  );
  const s2 = add(...range(12).map((i) => entity(`svc${i}`, `Service Client ${i} Pvt Ltd`)));
  const bank = add(entity('bank', 'National Bank Ltd', 'bank'));
  const s3 = add(...range(8).map((i) => entity(`debtor${i}`, `Debtor ${i} Pvt Ltd`)));
  const lender = add(entity('lender', 'Small Finance Ltd'));
  const s4 = add(entity('ka', 'Kappa Infra Pvt Ltd'), entity('la', 'Lambda Infra Pvt Ltd'));
  const s5 = add(
    entity('sg1', 'Shree Ganesh Steels Private Limited'),
    entity('sg2', 'Shree Ganesh Steel Limited'),
  );
  add(
    entity('ucb1', 'Urban Co-operative Bank Ltd, Cuttack', 'bank'),
    entity('ucb2', 'Urban Co-operative Bank Ltd, Sikar', 'bank'),
  );
  const s7 = add(entity('delta', 'Delta Exports Ltd'), entity('epsilon', 'Epsilon Holdings Ltd'));
  const s8 = add(entity('zeta', 'Zeta Realty Ltd'), entity('eta', 'Eta Builders Ltd'));
  const s9 = add(...range(8).map((i) => entity(`nbfc${i}`, `NBFC ${i} Finance Ltd`)));
  // Distinct registered companies: obviously fake CINs that cannot collide with real ones.
  const s10 = add(
    { ...entity('grp1', 'Omega Steel Industries Ltd'), cin: 'SYNTH-CIN-0001' },
    { ...entity('grp2', 'Omega Steel Trading Ltd'), cin: 'SYNTH-CIN-0002' },
  );
  const addresses: Address[] = [
    {
      address_id: 'adr_synth_cowork',
      normalized_address: 'SYNTH CO WORKING HUB 1 TEST RD MUMBAI',
      raw_address: 'SYNTHETIC Co-working Hub, 1 Test Road, Mumbai',
      state: 'Maharashtra',
      normalization_confidence: 0.8,
      entity_count: 3,
    },
    {
      address_id: 'adr_synth_service',
      normalized_address: 'SYNTH SERVICE ADDRESS 9 TEST RD PUNE',
      raw_address: 'SYNTHETIC Service Address, 9 Test Road, Pune',
      state: 'Maharashtra',
      normalization_confidence: 0.8,
      entity_count: 12,
    },
    {
      address_id: 'adr_synth_group',
      normalized_address: 'SYNTH OMEGA HOUSE 5 TEST RD NAGPUR',
      raw_address: 'SYNTHETIC Omega House, 5 Test Road, Nagpur',
      state: 'Maharashtra',
      normalization_confidence: 0.8,
      entity_count: 2,
    },
  ];
  const persons: Person[] = [
    {
      person_id: 'per_synth_ip',
      name: 'SYNTH INSOLVENCY PROFESSIONAL',
      name_variants: [],
      roles: ['insolvency_professional'],
      sources: ['ibbi'],
    },
  ];
  const events = [
    event(
      'order',
      'sebi',
      'sebi_final_order',
      'Final order in the matter of Delta Exports Ltd and Epsilon Holdings Ltd',
    ),
    event('pr', 'ed', 'ed_provisional_attachment', 'Attachment of assets of Zeta Realty Ltd'),
    event('batch', 'rbi', 'rbi_cor_cancellation', 'RBI cancels registration of 8 NBFCs'),
    ...s3.map((_, i) =>
      event(`cirp${i + 1}`, 'ibbi', 'ibbi_cirp', `CIRP of Debtor ${i + 1} Pvt Ltd`),
    ),
  ];
  const documents = [
    doc('mca', 'mca_ogd', 'SYNTHETIC company master'),
    ...events.map((e) => doc(e.event_id.replace('evt_synth_', ''), e.source_id, e.title)),
  ];
  const rels: Relationship[] = [
    ...s1.map((id) => rel(id, 'REGISTERED_AT', 'adr_synth_cowork', 'doc_synth_mca')),
    ...s2.map((id) => rel(id, 'REGISTERED_AT', 'adr_synth_service', 'doc_synth_mca')),
    ...s10.map((id) => rel(id, 'REGISTERED_AT', 'adr_synth_group', 'doc_synth_mca')),
    ...s3.flatMap((id, i) => [
      rel(
        id,
        'NAMED_IN_PROCEEDING',
        `evt_synth_cirp${i + 1}`,
        `doc_synth_cirp${i + 1}`,
        'fact',
        'ibbi',
      ),
      rel(
        bank[0] ?? '',
        'INSOLVENCY_APPLICANT_AGAINST',
        id,
        `doc_synth_cirp${i + 1}`,
        'fact',
        'ibbi',
      ),
      rel(
        'per_synth_ip',
        'INSOLVENCY_PROFESSIONAL_FOR',
        id,
        `doc_synth_cirp${i + 1}`,
        'fact',
        'ibbi',
      ),
    ]),
    ...s4.map((id) =>
      rel(lender[0] ?? '', 'INSOLVENCY_APPLICANT_AGAINST', id, 'doc_synth_cirp1', 'fact', 'ibbi'),
    ),
    ...s7.map((id) =>
      rel(id, 'NAMED_IN_PROCEEDING', 'evt_synth_order', 'doc_synth_order', 'finding', 'sebi'),
    ),
    rel(s8[0] ?? '', 'NAMED_IN_PROCEEDING', 'evt_synth_pr', 'doc_synth_pr', 'allegation', 'ed'),
    rel(s8[1] ?? '', 'NAMED_IN_PROCEEDING', 'evt_synth_pr', 'doc_synth_pr', 'inference', 'ed'),
    ...s9.map((id) =>
      rel(id, 'NAMED_IN_PROCEEDING', 'evt_synth_batch', 'doc_synth_batch', 'fact', 'rbi'),
    ),
  ];
  const [sg1 = '', sg2 = ''] = s5;
  const matchCandidates: EntityMatchCandidate[] = [
    {
      entity_a: sg1,
      entity_b: sg2,
      name_a: 'SYNTH Shree Ganesh Steels Private Limited',
      name_b: 'SYNTH Shree Ganesh Steel Limited',
      similarity: 0.75,
      reason: 'token_jaccard_same_first_token',
    },
  ];
  return {
    entities: ents,
    persons,
    addresses,
    relationships: rels,
    events,
    documents,
    matchCandidates,
    datasetBuiltAt: null,
  };
}
