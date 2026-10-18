import { ASSIST_TASKS, AssistInputSchema, AssistResultSchema } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../../demo/seed.js';
import { allAlerts } from '../alerts.js';
import { buildContext, type CopilotTarget } from './context.js';
import { scrub } from './pack.js';
import { simulateAssist } from './simulate.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const NOW = new Date('2026-10-18T06:00:00Z');

const targets: CopilotTarget[] = [
  { kind: 'portfolio' },
  ...db.applications.slice(0, 4).map((a) => ({ kind: 'application' as const, id: a.id })),
  ...db.loans.slice(0, 4).map((l) => ({ kind: 'loan' as const, id: l.id })),
  ...db.borrowers.slice(0, 3).map((b) => ({ kind: 'borrower' as const, id: b.id })),
  ...db.cases.slice(0, 3).map((c) => ({ kind: 'case' as const, id: c.id })),
  ...allAlerts(db)
    .slice(0, 6)
    .map((a) => ({ kind: 'alert' as const, id: a.id })),
];

describe('copilot context packs', () => {
  it('are valid requests for every kind of record (B-66)', () => {
    for (const t of targets) {
      const pack = buildContext(db, t, 'Anjali Patil', 'all');
      expect(pack, JSON.stringify(t)).not.toBeNull();
      if (pack === null) continue;
      const parsed = AssistInputSchema.safeParse({
        task: 'explain',
        subject: pack.subject,
        question: '',
        facts: pack.facts,
      });
      expect(parsed.success, JSON.stringify(t)).toBe(true);
      expect(new Set(pack.facts.map((f) => f.ref)).size).toBe(pack.facts.length);
      for (const href of Object.values(pack.links)) expect(href.startsWith('/')).toBe(true);
    }
  });

  it('returns null for a record that does not exist', () => {
    expect(buildContext(db, { kind: 'loan', id: 'missing' }, 'x', 'all')).toBeNull();
  });

  it('masks PAN and long identifier numbers but keeps amounts', () => {
    const out = scrub('PAN ABCDE1234F, account 123456789012, ₹1,00,000');
    expect(out).toContain('XXXXX1234X');
    expect(out).not.toContain('ABCDE');
    expect(out).not.toContain('12345678');
    expect(out).toContain('₹1,00,000');
  });
});

describe('simulated copilot answers', () => {
  it('answer every task with statements that all pass the grounding check', () => {
    for (const t of targets) {
      const pack = buildContext(db, t, 'Anjali Patil', 'all');
      if (pack === null) continue;
      for (const task of ASSIST_TASKS) {
        const input = {
          task,
          subject: pack.subject,
          question: task === 'ask' ? 'Which transactions were cash withdrawals?' : '',
          facts: pack.facts,
        };
        const r = simulateAssist(input, NOW);
        expect(AssistResultSchema.safeParse(r).success).toBe(true);
        expect(r.statements.length, `${JSON.stringify(t)} ${task}`).toBeGreaterThan(0);
        expect(r.check.kept, `${JSON.stringify(t)} ${task}`).toBe(r.check.received);
        expect(r.mock).toBe(true);
        expect(r.model).toBeNull();
      }
    }
  });

  it('says so when the record cannot answer a question', () => {
    const pack = buildContext(db, { kind: 'portfolio' }, 'Anjali Patil', 'all');
    if (pack === null) throw new Error('no portfolio');
    const r = simulateAssist(
      { task: 'ask', subject: pack.subject, question: 'zebra giraffe weather', facts: pack.facts },
      NOW,
    );
    expect(r.statements[0]?.text).toMatch(/does not contain information/);
  });
});
