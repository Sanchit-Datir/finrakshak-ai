import type { CaseEvent, Relationship } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { buildPopulation } from './population.js';

const event = (
  id: string,
  caseType: string,
  date: string | null,
  pub: string | null = null,
): CaseEvent => ({
  event_id: id,
  case_type: caseType,
  authority: 'SYNTHETIC',
  source_id: caseType.startsWith('ibbi') ? 'ibbi' : 'ed',
  document_id: `doc_${id}`,
  title: `SYNTH ${id}`,
  party_names: [],
  event_date: date,
  publication_date: pub,
  proceeding_status: 'x',
  outcome: null,
  appeal_status: null,
  amounts: [],
});
const link = (
  entity: string,
  ev: string,
  status: Relationship['evidence_status'] = 'fact',
  type: Relationship['relationship_type'] = 'NAMED_IN_PROCEEDING',
): Relationship => ({
  relationship_id: `rel_${entity}_${ev}_${status}`,
  from_id: entity,
  relationship_type: type,
  to_id: ev,
  valid_from: null,
  valid_to: null,
  first_observed_at: null,
  source_id: 'ed',
  document_id: `doc_${ev}`,
  evidence_status: status,
  confidence: 0.9,
});
const settings = { earliestRealDate: '1990-01-01' };

describe('buildPopulation', () => {
  const events = [
    event('e1', 'ed_arrest', '2020-01-01'),
    event('e2', 'ibbi_cirp', null, '2020-09-01'),
    event('e3', 'ibbi_cirp', '1970-01-01'),
    event('e4', 'ed_arrest', null),
    event('e5', 'ed_search_seizure', '2022-05-05'),
  ];

  it('makes one ordered timeline per entity from its named-in links, using the publication date when there is no event date', () => {
    const p = buildPopulation(
      events,
      [link('ent_b', 'e2'), link('ent_b', 'e1'), link('ent_a', 'e5')],
      settings,
    );
    expect(p.timelines.map((t) => t.subject_id)).toEqual(['ent_a', 'ent_b']);
    expect(p.timelines[1]?.events.map((e) => e.event_id)).toEqual(['e1', 'e2']);
  });

  it('leaves out placeholder and missing dates, counts them, and drops entities left with nothing', () => {
    const p = buildPopulation(
      events,
      [link('ent_c', 'e3'), link('ent_c', 'e4'), link('ent_a', 'e5'), link('ent_d', 'missing')],
      settings,
    );
    expect(p.timelines.map((t) => t.subject_id)).toEqual(['ent_a']);
    expect(p.undated).toBe(3);
  });

  it('uses the latest date in the data as as_of for every timeline', () => {
    const p = buildPopulation(events, [link('ent_a', 'e5'), link('ent_b', 'e2')], settings);
    expect(p.asOf).toBe('2022-05-05');
    expect(p.timelines.every((t) => t.as_of === '2022-05-05')).toBe(true);
  });

  it('ignores other kinds of link and keeps the weakest evidence status seen for a document', () => {
    const p = buildPopulation(
      events,
      [
        link('ent_a', 'e1', 'fact'),
        link('ent_b', 'e1', 'allegation'),
        link('ent_c', 'e1', 'finding', 'CO_MENTIONED_WITH'),
      ],
      settings,
    );
    expect(p.statusByDocument.get('doc_e1')).toBe('allegation');
    expect(p.timelines.map((t) => t.subject_id)).toEqual(['ent_a', 'ent_b']);
  });

  it('gives the same result however the links are ordered', () => {
    const links = [link('ent_a', 'e5'), link('ent_b', 'e1'), link('ent_b', 'e2')];
    expect(buildPopulation(events, [...links].reverse(), settings)).toEqual(
      buildPopulation(events, links, settings),
    );
  });
});
