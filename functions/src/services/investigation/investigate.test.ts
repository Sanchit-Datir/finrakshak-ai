import { InvestigateApplicationResultSchema } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { GeminiError } from '../gemini.js';
import type { ToolModel } from '../tool-model.js';
import { BUNDLE, call, scripted } from './bundle.fixture.js';
import { LIMITS } from './input.js';
import {
  checkSize,
  InvestigationInputTooLarge,
  investigate,
  mockModel,
  overview,
} from './investigate.js';

const summary = call('submit_summary', { summary: 'Two leads to check.' });
const read = call('get_section', { section: 'loan' });

async function failure(model: ToolModel, now?: () => number): Promise<string> {
  try {
    await investigate(BUNDLE, model, now === undefined ? {} : { now });
    return 'ok';
  } catch (e) {
    if (e instanceof GeminiError) return e.message;
    throw e;
  }
}

describe('investigate', () => {
  it('keeps verified claims, counts rejected ones and finishes on the summary', async () => {
    const model = scripted([
      [read, call('get_public_record_candidates', { partyId: 'customer:0' })],
      [
        call('submit_finding', {
          kind: 'public_record_match',
          priority: 'urgent',
          statement: 'SYNTH Mills Ltd may be SYNTH MILLS LIMITED; needs verification.',
          partyId: 'customer:0',
          citations: [{ type: 'record', ref: 'org:2' }],
        }),
        call('submit_finding', {
          kind: 'implausible_numbers',
          priority: 'routine',
          statement: 'Loan per acre is ₹20,00,000.',
          citations: [{ type: 'ratio', ref: 'loan_per_acre' }],
        }),
        call('submit_question', { question: 'What is the loan for?', gap: 'loan.purpose' }),
        summary,
      ],
      [read],
    ]);
    const r = await investigate(BUNDLE, model);
    expect(r.claims).toEqual({ made: 3, verified: 2, rejected: 1 });
    expect(r.rejections).toEqual([{ reason: 'unknown_number', count: 1 }]);
    expect(r.findings[0]?.match).toBe('possible');
    expect(r.summary).toBe('Two leads to check.');
    expect(model.seen).toBe(2);
  });

  it('refuses reads past the read budget but still accepts the summary', async () => {
    const reads = Array.from({ length: LIMITS.maxReadCalls + 2 }, () => read);
    const r = await investigate(BUNDLE, scripted([reads, [summary]]));
    expect(r.toolCalls).toBe(LIMITS.maxReadCalls + 3);
    expect(r.summary).toBe('Two leads to check.');
  });

  it('stops after the turn limit', async () => {
    const model = scripted(Array.from({ length: LIMITS.maxTurns + 5 }, () => [read]));
    await investigate(BUNDLE, model);
    expect(model.seen).toBe(LIMITS.maxTurns);
  });

  it('asks before every model call after the first and stops when refused', async () => {
    const model = scripted([[read], [read], [read]]);
    let asked = 0;
    const r = await investigate(BUNDLE, model, {
      beforeNextTurn: () => Promise.resolve(++asked < 2),
    });
    expect(model.seen).toBe(2);
    expect(r).toMatchObject({ modelCalls: 2, stoppedAtDailyLimit: true });
  });

  it('retries a malformed reply once, then fails', async () => {
    const bad = call('submit_finding', { kind: 'nonsense' });
    expect(await failure(scripted([[bad], [summary]]))).toBe('ok');
    expect(await failure(scripted([[bad], [bad]]))).toMatch(/expected shape/);
  });

  it('fails on a cut-off reply instead of keeping a partial result', async () => {
    const model: ToolModel = {
      id: 'm',
      start: () => ({ step: () => Promise.reject(new GeminiError('Model response was cut off')) }),
    };
    expect(await failure(model)).toMatch(/cut off/);
  });

  it('fails when the deadline passes', async () => {
    let t = 0;
    const now = (): number => (t += 60_000);
    expect(await failure(scripted([[read], [read], [read]]), now)).toMatch(/too long/);
  });

  it('withholds a summary with verdict words', async () => {
    const r = await investigate(
      BUNDLE,
      scripted([[call('submit_summary', { summary: 'Clear fraud.' })]]),
    );
    expect(r.summary).toBe('');
    expect(r.summaryWithheld).toBe(true);
  });

  it('withholds a summary longer than the short cap', async () => {
    const long = call('submit_summary', { summary: 'Two leads. '.repeat(50) });
    const r = await investigate(BUNDLE, scripted([[long]]));
    expect(r.summary).toBe('');
    expect(r.summaryWithheld).toBe(true);
  });

  it('caps kept findings at the limit', async () => {
    const f = call('submit_finding', {
      kind: 'implausible_numbers',
      priority: 'routine',
      statement: 'Loan per acre looks high.',
      citations: [{ type: 'ratio', ref: 'loan_per_acre' }],
    });
    const r = await investigate(
      BUNDLE,
      scripted([[...Array.from({ length: LIMITS.outputFindings + 2 }, () => f), summary]]),
    );
    expect(r.findings).toHaveLength(LIMITS.outputFindings);
    expect(r.rejections).toEqual([{ reason: 'over_limit', count: 2 }]);
  });
});

describe('the mock', () => {
  it('runs the same checks and produces a valid, labelled result', async () => {
    const r = await investigate(BUNDLE, mockModel(BUNDLE));
    const full = {
      ...r,
      mock: true,
      model: null,
      investigatedAt: new Date(0).toISOString(),
      remainingToday: null,
    };
    expect(InvestigateApplicationResultSchema.safeParse(full).success).toBe(true);
    expect(r.claims.rejected).toBe(0);
    expect(r.findings.map((f) => f.kind)).toEqual(['public_record_match', 'related_entity_link']);
    expect(r.questions.map((q) => q.gap)).toEqual(['loan.purpose']);
    expect(
      [r.summary, ...r.findings.map((f) => f.statement)].every((s) => s.startsWith('[mock]')),
    ).toBe(true);
  });
});

describe('input bounds', () => {
  it('refuses a bundle over the size limit', () => {
    const big = {
      ...BUNDLE,
      findings: [
        {
          findingId: 'x',
          title: 'x'.repeat(LIMITS.maxBundleChars),
          priority: 'routine' as const,
          observed: '',
        },
      ],
    };
    expect(() => {
      checkSize(big);
    }).toThrow(InvestigationInputTooLarge);
  });

  it('delimits the data in the overview and sends no field values', () => {
    const o = overview(BUNDLE);
    expect(o.startsWith('<<<APPLICATION_OVERVIEW')).toBe(true);
    expect(o).not.toContain('25,00,000');
  });
});
