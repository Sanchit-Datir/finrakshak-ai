import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileStore, UserProfile } from '../services/profiles.js';
import { createRateLimiter } from '../services/rate-limit.js';
import {
  ALERTS_PAGE,
  SCORES_PAGE,
  type RiskQuery,
  type RiskScoreReader,
} from '../services/riskScores.js';
import { getRiskScoresHandler, type GetRiskScoresDeps } from './getRiskScores.js';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('firebase-functions', () => ({ logger: log }));
beforeEach(() => {
  log.info.mockClear();
  log.error.mockClear();
});

const officer: UserProfile = {
  name: 'Anjali Patil',
  employeeId: 'EMP-1',
  branchId: 'br-synth',
  role: 'branch_officer',
  aiEnabled: false,
  enabled: true,
};

const doc = (
  loan: string,
  branch: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  loan_id: loan,
  branch_id: branch,
  synthetic: true,
  state: { score: 1 },
  previous: null,
  ...extra,
});

function reader(
  latest: unknown[],
  alerts: unknown[] = [],
): RiskScoreReader & { queries: RiskQuery[] } {
  const queries: RiskQuery[] = [];
  return {
    queries,
    latest: (q, limit) => {
      queries.push(q);
      return Promise.resolve(latest.slice(0, limit));
    },
    alerts: (_q, limit) => Promise.resolve(alerts.slice(0, limit)),
  };
}

const deps = (r: RiskScoreReader, profile: UserProfile | null = officer): GetRiskScoresDeps => ({
  profiles: { get: () => Promise.resolve(profile) } satisfies ProfileStore,
  reader: r,
  limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
});

const req = (
  data: unknown,
  token: Record<string, unknown> = {},
  uid = 'u1',
): CallableRequest<unknown> =>
  ({ data, auth: { uid, token } }) as unknown as CallableRequest<unknown>;

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  const e = await p.catch((x: unknown) => x);
  return e instanceof HttpsError ? e.code : 'no error';
};

describe('getRiskScoresHandler', () => {
  it('rejects a caller who is not signed in, or has no profile', async () => {
    const r = reader([]);
    const anon = { data: {}, auth: undefined } as unknown as CallableRequest<unknown>;
    expect(await codeOf(getRiskScoresHandler(anon, deps(r)))).toBe('unauthenticated');
    expect(await codeOf(getRiskScoresHandler(req({}), deps(r, null)))).toBe('permission-denied');
    expect(r.queries).toHaveLength(0);
  });

  it('rejects malformed input before reading anything', async () => {
    const r = reader([]);
    for (const bad of [{ loanId: '../x' }, { loanId: 5 }, { other: 1 }, 'x'])
      expect(await codeOf(getRiskScoresHandler(req(bad), deps(r)))).toBe('invalid-argument');
    expect(r.queries).toHaveLength(0);
  });

  it("shows a branch officer only their branch's loans and never the stored alert state", async () => {
    const r = reader([doc('L-1', 'br-synth'), doc('L-2', 'br-other')]);
    const out = await getRiskScoresHandler(req({}), deps(r));
    expect(r.queries[0]?.scope).toEqual({ kind: 'branch', branchId: 'br-synth' });
    expect(out.scores.map((s) => s['loan_id'])).toEqual(['L-1']);
    expect(out.scores[0]).not.toHaveProperty('state');
    expect(out.scores[0]).not.toHaveProperty('previous');
  });

  it('shows every branch to a cross-branch role or an admin', async () => {
    const r = reader([doc('L-1', 'br-synth'), doc('L-2', 'br-other')]);
    const analyst = await getRiskScoresHandler(
      req({}),
      deps(r, { ...officer, role: 'risk_analyst', branchId: 'hq' }),
    );
    expect(analyst.scores).toHaveLength(2);
    const admin = await getRiskScoresHandler(
      req({}, { admin: true }),
      deps(r, { ...officer, branchId: 'hq' }),
    );
    expect(admin.scores).toHaveLength(2);
  });

  it('drops malformed and non-synthetic documents (B-54)', async () => {
    const r = reader([doc('L-1', 'br-synth', { synthetic: false }), { loan_id: 'L-2' }, 'junk']);
    expect((await getRiskScoresHandler(req({}), deps(r))).scores).toEqual([]);
  });

  it('caps each list and says so', async () => {
    const many = Array.from({ length: SCORES_PAGE + 5 }, (_, i) => doc(`L-${i}`, 'br-synth'));
    const alerts = Array.from({ length: ALERTS_PAGE + 1 }, (_, i) => doc(`L-${i}`, 'br-synth'));
    const out = await getRiskScoresHandler(req({}), deps(reader(many, alerts)));
    expect(out.scores).toHaveLength(SCORES_PAGE);
    expect(out.alerts).toHaveLength(ALERTS_PAGE);
    expect(out.truncated).toBe(true);
  });

  it('turns a read failure into a readable error without details', async () => {
    const failing: RiskScoreReader = {
      latest: () => Promise.reject(new Error('PERMISSION_DENIED: secret detail')),
      alerts: () => Promise.resolve([]),
    };
    const e = await getRiskScoresHandler(req({}), deps(failing)).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpsError);
    expect((e as HttpsError).message).toBe('The risk scores could not be loaded.');
  });

  it('rate-limits a caller', async () => {
    const d = { ...deps(reader([])), limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) };
    await getRiskScoresHandler(req({}), d);
    expect(await codeOf(getRiskScoresHandler(req({}), d))).toBe('resource-exhausted');
  });
});
