import { describe, expect, it } from 'vitest';
import {
  FlaggedNeighbourSchema,
  MatchResultSchema,
  SubjectTimelineSchema,
  timelineFromEvents,
  type RawTimelineEvent,
} from './timeline.js';

const ev = (
  event_id: string,
  date: string | null,
  case_type: string,
  extra: Partial<RawTimelineEvent> = {},
): RawTimelineEvent => ({
  event_id,
  date,
  case_type,
  source_id: 'ed',
  evidence_status: 'allegation',
  ...extra,
});

describe('timelineFromEvents', () => {
  it('sorts by date then event_id and looks up each record kind', () => {
    const t = timelineFromEvents(
      's',
      [
        ev('b', '2023-05-01', 'ibbi_cirp', { source_id: 'ibbi' }),
        ev('z', '2023-01-01', 'ed_arrest'),
        ev('a', '2023-01-01', 'nfra_disciplinary_order', { source_id: 'nfra' }),
      ],
      '2024-01-01',
    );
    expect(t.events.map((e) => e.event_id)).toEqual(['a', 'z', 'b']);
    expect(t.events.map((e) => e.kind)).toEqual([null, 'enforcement', 'insolvency']);
    expect(SubjectTimelineSchema.safeParse(t).success).toBe(true);
  });

  it('is replay-safe: an event after as_of is dropped and cannot change the result', () => {
    const base = [ev('a', '2023-01-01', 'ed_arrest')];
    const later = [...base, ev('b', '2024-02-02', 'ibbi_cirp')];
    expect(timelineFromEvents('s', later, '2024-02-01')).toEqual(
      timelineFromEvents('s', base, '2024-02-01'),
    );
    expect(timelineFromEvents('s', later, '2024-02-02').events).toHaveLength(2);
  });

  it('drops undated events and keeps the first of a repeated event_id', () => {
    const t = timelineFromEvents(
      's',
      [
        ev('a', null, 'ed_arrest'),
        ev('b', '', 'ed_arrest'),
        ev('c', '2023-01-01', 'ed_arrest'),
        ev('c', '2023-02-02', 'ibbi_cirp'),
      ],
      '2024-01-01',
    );
    expect(t.events.map((e) => [e.event_id, e.date, e.case_type])).toEqual([
      ['c', '2023-01-01', 'ed_arrest'],
    ]);
  });

  it('keeps a known evidence status and maps anything else to unknown, never upgrading it', () => {
    const t = timelineFromEvents(
      's',
      [
        ev('a', '2023-01-01', 'ed_arrest', { evidence_status: 'allegation' }),
        ev('b', '2023-01-02', 'ed_arrest', { evidence_status: 'proven' }),
        ev('c', '2023-01-03', 'ed_arrest', { evidence_status: null }),
        { event_id: 'd', date: '2023-01-04', case_type: 'ed_arrest', source_id: 'ed' },
      ],
      '2024-01-01',
    );
    expect(t.events.map((e) => e.evidence_status)).toEqual([
      'allegation',
      'unknown',
      'unknown',
      'unknown',
    ]);
  });

  it('keeps an unmapped case type with a null kind rather than dropping it', () => {
    const t = timelineFromEvents(
      's',
      [ev('a', '2023-01-01', 'rbi_monetary_penalty')],
      '2024-01-01',
    );
    expect(t.events).toHaveLength(1);
    expect(t.events[0]?.kind).toBeNull();
  });

  it('gives the same answer for the same events in any input order', () => {
    const events = [
      ev('a', '2023-01-01', 'ed_arrest'),
      ev('b', '2023-01-01', 'ibbi_cirp'),
      ev('c', '2022-12-31', 'ed_conviction'),
    ];
    expect(timelineFromEvents('s', [...events].reverse(), '2024-01-01')).toEqual(
      timelineFromEvents('s', events, '2024-01-01'),
    );
  });

  it('returns a valid empty timeline for no events', () => {
    const t = timelineFromEvents('s', [], '2024-01-01');
    expect(t.events).toEqual([]);
    expect(SubjectTimelineSchema.safeParse(t).success).toBe(true);
  });
});

describe('SubjectTimeline schema', () => {
  const e = (event_id: string, date: string): Record<string, string> => ({
    event_id,
    date,
    case_type: 'ed_arrest',
    kind: 'enforcement',
    source_id: 'ed',
    evidence_status: 'allegation',
  });
  const t = (events: unknown[], as_of = '2024-01-01'): boolean =>
    SubjectTimelineSchema.safeParse({ subject_id: 's', as_of, events }).success;

  it('rejects unsorted events, an event after as_of and a repeated event_id', () => {
    expect(t([e('a', '2023-02-01'), e('b', '2023-01-01')])).toBe(false);
    expect(t([e('a', '2024-01-02')])).toBe(false);
    expect(t([e('a', '2023-01-01'), e('a', '2023-02-01')])).toBe(false);
    expect(t([e('a', '2023-01-01'), e('b', '2023-02-01')])).toBe(true);
  });
  it('rejects a date that is not an ISO date', () => {
    expect(t([e('a', '01/02/2023')])).toBe(false);
  });
});

describe('FlaggedNeighbour and MatchResult schemas', () => {
  it('limits hops to 1 to 3 and link status to the three known values', () => {
    const n = {
      entity_id: 'x',
      hops: 2,
      link_status: 'verified',
      kinds: ['liquidation'],
      is_hub: false,
    };
    expect(FlaggedNeighbourSchema.safeParse(n).success).toBe(true);
    expect(FlaggedNeighbourSchema.safeParse({ ...n, hops: 4 }).success).toBe(false);
    expect(FlaggedNeighbourSchema.safeParse({ ...n, hops: 0 }).success).toBe(false);
    expect(FlaggedNeighbourSchema.safeParse({ ...n, link_status: 'guessed' }).success).toBe(false);
  });
  it('keeps strength between 0 and 1', () => {
    const r = {
      pattern_id: 'pat_0123456789abcdef',
      strength: 1,
      matched_event_ids: [],
      matched_neighbour_ids: [],
    };
    expect(MatchResultSchema.safeParse(r).success).toBe(true);
    expect(MatchResultSchema.safeParse({ ...r, strength: 1.01 }).success).toBe(false);
    expect(MatchResultSchema.safeParse({ ...r, strength: -0.1 }).success).toBe(false);
  });
});
