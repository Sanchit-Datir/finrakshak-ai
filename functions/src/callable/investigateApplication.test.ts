import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import { GeminiError } from '../services/gemini.js';
import { BUNDLE, call, scripted } from '../services/investigation/bundle.fixture.js';
import { createRateLimiter } from '../services/rate-limit.js';
import type { ToolModel } from '../services/tool-model.js';
import {
  investigateApplicationHandler,
  type InvestigateApplicationDeps,
} from './investigateApplication.js';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('firebase-functions', () => ({ logger: log }));

const NOW = new Date('2026-10-18T06:00:00.000Z');

const req = (data: unknown, signedIn = true): CallableRequest<unknown> =>
  ({
    data,
    auth: signedIn ? { uid: 'u1', token: {} } : undefined,
  }) as unknown as CallableRequest<unknown>;

const goodModel = (): ToolModel =>
  scripted([
    [
      call('submit_finding', {
        kind: 'implausible_numbers',
        priority: 'routine',
        statement: 'Loan per acre is ₹16,66,667.',
        citations: [{ type: 'ratio', ref: 'loan_per_acre' }],
      }),
      call('submit_summary', { summary: 'One lead.' }),
    ],
  ]);

function deps(
  opts: { allowed?: boolean; limit?: number; model?: () => ToolModel; usedToday?: number } = {},
): InvestigateApplicationDeps & { used: () => number; models: () => number } {
  let calls = opts.usedToday ?? 0;
  let models = 0;
  const make = opts.model ?? goodModel;
  return {
    // Like the Firestore store: refuses at the limit, never counts past it.
    usage: {
      tryIncrement: (_uid, _day, limit) => Promise.resolve(calls >= limit ? undefined : ++calls),
    },
    access: { isAllowed: () => Promise.resolve(opts.allowed ?? true) },
    limiter: createRateLimiter({ limit: opts.limit ?? 1_000, windowMs: 60_000 }),
    now: () => NOW,
    model: () => {
      models++;
      return make();
    },
    used: () => calls,
    models: () => models,
  };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof HttpsError) return e.code;
    throw e;
  }
}

beforeEach(() => {
  resetEnvCache();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('investigateApplication', () => {
  it('requires sign-in', async () => {
    expect(await codeOf(investigateApplicationHandler(req(BUNDLE, false), deps()))).toBe(
      'unauthenticated',
    );
  });

  it('rejects malformed input', async () => {
    const bad = { ...BUNDLE, parties: 'nope' };
    expect(await codeOf(investigateApplicationHandler(req(bad), deps()))).toBe('invalid-argument');
  });

  it('applies the burst limit', async () => {
    const d = deps({ limit: 1 });
    await investigateApplicationHandler(req(BUNDLE), d);
    expect(await codeOf(investigateApplicationHandler(req(BUNDLE), d))).toBe('resource-exhausted');
  });

  it('answers from the free mock without the stores or a billed model', async () => {
    const d = deps();
    const r = await investigateApplicationHandler(req(BUNDLE), d);
    expect(r).toMatchObject({ mock: true, model: null, remainingToday: null });
    expect(r.investigatedAt).toBe(NOW.toISOString());
    expect(d.used()).toBe(0);
    expect(d.models()).toBe(0);
  });

  describe('billed provider', () => {
    beforeEach(() => {
      vi.stubEnv('GEMINI_PROVIDER', 'vertex');
      // Pinned so these tests do not depend on the deployed default.
      vi.stubEnv('GEMINI_DAILY_LIMIT', '30');
    });

    it('returns verified output, counts one use and logs counts only', async () => {
      const d = deps();
      const r = await investigateApplicationHandler(req(BUNDLE), d);
      expect(r).toMatchObject({ mock: false, model: 'test-model', remainingToday: 29 });
      expect(r.claims).toEqual({ made: 1, verified: 1, rejected: 0 });
      expect(d.used()).toBe(1);
      const logged = JSON.stringify(log.info.mock.calls);
      expect(logged).not.toContain('16,66,667');
      expect(logged).not.toContain('SYNTH');
    });

    it('counts every model call and stops at the daily limit without crossing it', async () => {
      const finding = call('submit_finding', {
        kind: 'implausible_numbers',
        priority: 'routine',
        statement: 'Loan per acre looks high.',
        citations: [{ type: 'ratio', ref: 'loan_per_acre' }],
      });
      const read = call('get_section', { section: 'loan' });
      const threeTurns = (): ToolModel => scripted([[finding], [read], [read]]);
      const d = deps({ model: threeTurns, usedToday: 28 });
      const r = await investigateApplicationHandler(req(BUNDLE), d);
      expect(d.used()).toBe(30);
      expect(r).toMatchObject({ modelCalls: 2, stoppedAtDailyLimit: true, remainingToday: 0 });
      expect(r.findings).toHaveLength(1);
    });

    it('counts each call of a full run', async () => {
      const read = call('get_section', { section: 'loan' });
      const model = (): ToolModel =>
        scripted([[read], [read], [call('submit_summary', { summary: 'Nothing.' })]]);
      const d = deps({ model });
      const r = await investigateApplicationHandler(req(BUNDLE), d);
      expect(d.used()).toBe(3);
      expect(r).toMatchObject({ modelCalls: 3, stoppedAtDailyLimit: false, remainingToday: 27 });
    });

    it('refuses a run when the daily limit is already used up', async () => {
      const d = deps({ usedToday: 30 });
      expect(await codeOf(investigateApplicationHandler(req(BUNDLE), d))).toBe(
        'resource-exhausted',
      );
      expect(d.models()).toBe(0);
    });

    it('refuses an account without AI access before any model call', async () => {
      const d = deps({ allowed: false });
      expect(await codeOf(investigateApplicationHandler(req(BUNDLE), d))).toBe('permission-denied');
      expect(d.models()).toBe(0);
    });

    it('turns a model failure into a retryable error', async () => {
      const failing = (): ToolModel => ({
        id: 'm',
        start: () => ({
          step: () => Promise.reject(new GeminiError('Model response was cut off')),
        }),
      });
      expect(
        await codeOf(investigateApplicationHandler(req(BUNDLE), deps({ model: failing }))),
      ).toBe('unavailable');
    });

    it('refuses an oversized bundle without counting a use (B-10, B-15)', async () => {
      const finding = (i: number): object => ({
        findingId: `X${String(i)}`,
        title: 't'.repeat(300),
        priority: 'routine',
        observed: 'o'.repeat(300),
      });
      const fields = (s: string): object[] =>
        Array.from({ length: 20 }, (_, j) => ({
          path: `${s}.${String(j)}`,
          label: 'l'.repeat(120),
          value: 'v'.repeat(200),
        }));
      const big = {
        ...BUNDLE,
        sections: {
          ...BUNDLE.sections,
          applicant: fields('a'),
          business: fields('b'),
          loan: fields('c'),
          collateral: fields('d'),
        },
        findings: Array.from({ length: 25 }, (_, i) => finding(i)),
      };
      const d = deps();
      expect(await codeOf(investigateApplicationHandler(req(big), d))).toBe('invalid-argument');
      expect(d.used()).toBe(0);
    });
  });
});
