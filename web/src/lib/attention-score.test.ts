import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import type { Application, Priority } from '../domain/schemas.js';
import { attentionScore, bandOf } from './attention-score.js';
import type { Finding } from './checks.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const base = db.applications[0];
if (base === undefined) throw new Error('no demo application');
const app: Application = { ...base, findingStates: {} };

const finding = (id: string, priority: Priority): Finding => ({
  id,
  ruleId: id,
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

  it('puts one urgent finding in Urgent review, like Review priority', () => {
    expect(attentionScore(app, [finding('a', 'urgent')])).toMatchObject({
      score: 60,
      band: 'urgent',
    });
  });

  it('adds smaller findings up and caps at 100', () => {
    const three = ['a', 'b', 'c'].map((id) => finding(id, 'routine'));
    expect(attentionScore(app, three)).toMatchObject({ score: 30, band: 'needs_attention' });
    const many = ['a', 'b', 'c'].map((id) => finding(id, 'urgent'));
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
    expect(r).toMatchObject({ score: 10, band: 'routine', counted: 1 });
  });

  it('lists the three biggest drivers, biggest first', () => {
    const r = attentionScore(app, [
      finding('r', 'routine'),
      finding('u', 'urgent'),
      finding('n', 'needs_attention'),
      finding('r2', 'routine'),
    ]);
    expect(r.drivers.map((d) => d.findingId)).toEqual(['u', 'n', 'r']);
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
