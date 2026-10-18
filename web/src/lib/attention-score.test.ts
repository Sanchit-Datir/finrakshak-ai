import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import type { InvestigateApplicationResult, InvestigationFinding } from '@fund-tracker/shared';
import type { AiInvestigationSnapshot, Application, Priority } from '../domain/schemas.js';
import {
  AI_FINDING_POINTS,
  aiFindingsForScore,
  aiPointsOf,
  attentionScore,
  bandOf,
  pointsOf,
} from './attention-score.js';
import type { Finding } from './checks.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const base = db.applications[0];
if (base === undefined) throw new Error('no demo application');
const app: Application = { ...base, findingStates: {} };

const finding = (id: string, priority: Priority, ruleId = 'income_mismatch'): Finding => ({
  id,
  ruleId,
  title: `Finding ${id}`,
  category: 'document_inconsistency',
  priority,
  certainty: '',
  observed: '',
  whyItMatters: '',
  evidence: [],
  known: [],
  unknown: [],
  benign: [],
  steps: [],
});

describe('attentionScore', () => {
  it('is 0 and Routine review with no findings', () => {
    expect(attentionScore(app, [])).toEqual({
      score: 0,
      band: 'routine',
      drivers: [],
      counted: 0,
    });
  });

  it('weights an applicant in public records far above a missing document', () => {
    const applicant = finding('pr:applicant:N1', 'urgent', 'public_records');
    const missing = finding('m', 'urgent', 'missing_documents');
    expect(pointsOf(applicant)).toBe(70);
    expect(pointsOf(missing)).toBe(8);
    expect(attentionScore(app, [applicant])).toMatchObject({ score: 70, band: 'urgent' });
    expect(attentionScore(app, [missing])).toMatchObject({ score: 8, band: 'routine' });
  });

  it('scales a milder finding of the same check: urgent 100%, needs attention 60%, routine 30%', () => {
    expect(
      (['urgent', 'needs_attention', 'routine'] as const).map((p) =>
        pointsOf(finding('i', p, 'income_mismatch')),
      ),
    ).toEqual([30, 18, 9]);
    // An applicant's enforcement (ED) record is needs attention: 60% of 70.
    expect(pointsOf(finding('pr:applicant:N2', 'needs_attention', 'public_records'))).toBe(42);
  });

  it('weights customers and the not-current public-records check on their own', () => {
    expect(pointsOf(finding('pr:SYNTH Co', 'urgent', 'public_records'))).toBe(45);
    expect(pointsOf(finding('pr:not-current', 'needs_attention', 'public_records'))).toBe(15);
    expect(pointsOf(finding('pr:not-current', 'routine', 'public_records'))).toBe(8);
  });

  it('gives a check without a weight a middle weight, so a new rule still counts', () => {
    expect(pointsOf(finding('x', 'urgent', 'some_new_rule'))).toBe(30);
  });

  it('adds findings up and caps at 100', () => {
    const two = [
      finding('a', 'urgent', 'relationship_review'),
      finding('b', 'urgent', 'duplicate_survey'),
    ];
    expect(attentionScore(app, two)).toMatchObject({ score: 95, band: 'urgent' });
    const many = [...two, finding('c', 'urgent', 'income_mismatch')];
    expect(attentionScore(app, many).score).toBe(100);
  });

  it('leaves out resolved and not-an-issue findings', () => {
    const states: Application['findingStates'] = {
      a: { status: 'resolved', comments: [] },
      b: { status: 'not_an_issue', comments: [] },
      c: { status: 'in_review', comments: [] },
    };
    const r = attentionScore({ ...app, findingStates: states }, [
      finding('a', 'urgent'),
      finding('b', 'urgent'),
      finding('c', 'routine'),
    ]);
    expect(r).toMatchObject({ score: 9, band: 'routine', counted: 1 });
  });

  it('lists the three biggest drivers, biggest first', () => {
    const r = attentionScore(app, [
      finding('m', 'urgent', 'missing_documents'),
      finding('u', 'urgent', 'income_mismatch'),
      finding('pr:applicant:N1', 'urgent', 'public_records'),
      finding('d', 'needs_attention', 'dob_conflict'),
    ]);
    expect(r.drivers.map((d) => [d.findingId, d.points])).toEqual([
      ['pr:applicant:N1', 70],
      ['u', 30],
      ['d', 15],
    ]);
  });

  it('bands at the boundaries', () => {
    expect([0, 29, 30, 59, 60, 100].map(bandOf)).toEqual([
      'routine',
      'routine',
      'needs_attention',
      'needs_attention',
      'urgent',
      'urgent',
    ]);
  });
});

describe('verified AI findings in the score', () => {
  const ai = (
    id: string,
    kind: InvestigationFinding['kind'],
    priority: Priority = 'urgent',
  ): InvestigationFinding => ({
    id,
    kind,
    priority,
    statement: 'SYNTH lead',
    partyId: null,
    match: null,
    citations: [{ type: 'ratio', name: 'loan_per_acre' }],
  });
  const result = (
    findings: InvestigationFinding[],
    mock = false,
  ): InvestigateApplicationResult => ({
    mock,
    model: mock ? null : 'gemini-3.1-flash-lite',
    investigatedAt: '2026-10-18T06:00:00.000Z',
    summary: '',
    notEnoughEvidence: false,
    findings,
    questions: [],
    claims: { made: findings.length, verified: findings.length, rejected: 0 },
    rejections: [],
    toolCalls: 3,
    modelCalls: 2,
    stoppedAtDailyLimit: false,
    remainingToday: null,
  });
  const snap = (findings: InvestigationFinding[], mock = false): AiInvestigationSnapshot => ({
    inputsKey: 'K',
    evidence: {},
    publicRecordsLoaded: true,
    approved: {},
    result: result(findings, mock),
  });

  it('weights each kind and scales it by priority like rule findings', () => {
    expect(AI_FINDING_POINTS).toEqual({
      public_record_match: 45,
      related_entity_link: 40,
      implausible_numbers: 25,
      section_mismatch: 15,
    });
    const scale = (kind: InvestigationFinding['kind']): number[] =>
      (['urgent', 'needs_attention', 'routine'] as const).map((p) =>
        aiPointsOf({ kind, priority: p }),
      );
    expect(scale('public_record_match')).toEqual([45, 27, 14]);
    expect(scale('related_entity_link')).toEqual([40, 24, 12]);
    expect(scale('implausible_numbers')).toEqual([25, 15, 8]);
    expect(scale('section_mismatch')).toEqual([15, 9, 5]);
  });

  it('adds verified AI findings as labelled drivers', () => {
    const fs = aiFindingsForScore(snap([ai('ai:1', 'public_record_match')]), 'K');
    const r = attentionScore(app, [finding('R1', 'routine')], fs);
    expect(r.score).toBe(45 + 9);
    expect(r.drivers[0]).toMatchObject({
      source: 'ai',
      title: 'Possible public-record match',
      points: 45,
    });
    expect(r.drivers[1]?.source).toBe('rule');
  });

  it('counts nothing from a mock, an out-of-date or a dismissed AI finding', () => {
    expect(aiFindingsForScore(snap([ai('ai:1', 'section_mismatch')], true), 'K')).toEqual([]);
    expect(aiFindingsForScore(snap([ai('ai:1', 'section_mismatch')]), 'other')).toEqual([]);
    expect(aiFindingsForScore(null, 'K')).toEqual([]);
    const [f] = aiFindingsForScore(snap([ai('ai:1', 'section_mismatch')]), 'K');
    if (f === undefined) throw new Error('expected a finding');
    const dismissed = {
      ...app,
      findingStates: { [f.id]: { status: 'not_an_issue' as const, comments: [] } },
    };
    expect(attentionScore(dismissed, [], [f]).score).toBe(0);
  });
});
