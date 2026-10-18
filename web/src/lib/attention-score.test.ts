import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import type { Application, Priority } from '../domain/schemas.js';
import { attentionScore, bandOf, pointsOf } from './attention-score.js';
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
