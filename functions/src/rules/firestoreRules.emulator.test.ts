import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * firestore.rules against the Firestore emulator, through its REST API as a browser would call it.
 * Run with `npm run test:emulators` (root). Tokens are the emulator's unsigned mock ID tokens.
 */
const PROJECT = 'demo-fundtrace';
let base = '';

beforeAll(() => {
  const host = process.env['FIRESTORE_EMULATOR_HOST'];
  if (host === undefined)
    throw new Error('FIRESTORE_EMULATOR_HOST is not set; use npm run test:emulators');
  base = `http://${host}`;
});

const docs = (): string => `${base}/v1/projects/${PROJECT}/databases/(default)/documents`;

const b64url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** An unsigned ID token the emulator accepts, carrying the given custom claims. */
function idToken(uid: string, claims: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'password', identities: {} },
    ...claims,
  };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

/** An ID token, `owner` (the emulator's rules bypass) or `anonymous` (no Authorization header). */
type Caller = string;

const ADMIN = idToken('admin-1', { admin: true });
const USER = idToken('user-1');
/** Seeds data past the rules; never used for an assertion about access. */
const SEED: Caller = 'owner';

const authHeader = (token: Caller): Record<string, string> =>
  token === 'anonymous' ? {} : { Authorization: `Bearer ${token}` };

type Fields = Record<string, { stringValue: string } | { booleanValue: boolean }>;

async function request(
  method: string,
  path: string,
  token: Caller,
  fields?: Fields,
): Promise<number> {
  const res = await fetch(`${docs()}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    ...(fields === undefined ? {} : { body: JSON.stringify({ fields }) }),
  });
  await res.body?.cancel();
  return res.status;
}

const read = (path: string, token: Caller): Promise<number> => request('GET', path, token);
const write = (path: string, token: Caller, fields: Fields): Promise<number> =>
  request('PATCH', path, token, fields);
/** Create only: fails with 409 when the document exists, so it exercises `allow create`. */
const create = (collection: string, id: string, token: Caller, fields: Fields): Promise<number> =>
  request('POST', `${collection}?documentId=${id}`, token, fields);
const remove = (path: string, token: Caller): Promise<number> => request('DELETE', path, token);

const OK = 200;
const DENIED = 403;
const text = (value: string): { stringValue: string } => ({ stringValue: value });

beforeEach(async () => {
  const res = await fetch(`${base}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  expect(res.ok).toBe(true);
});

describe.each(['ingestRuns', 'ingestReviews', 'agentProposals'])('%s (admin read only)', (col) => {
  beforeEach(async () => {
    expect(await write(`${col}/d1`, SEED, { run_id: text('d1') })).toBe(OK);
  });

  it('lets an admin read a document and list the collection', async () => {
    expect(await read(`${col}/d1`, ADMIN)).toBe(OK);
    expect(await read(col, ADMIN)).toBe(OK);
  });

  it('denies a signed-in user without the admin claim, and anyone signed out', async () => {
    expect(await read(`${col}/d1`, USER)).toBe(DENIED);
    expect(await read(col, USER)).toBe(DENIED);
    expect(await read(`${col}/d1`, 'anonymous')).toBe(DENIED);
  });

  it('accepts only a boolean admin claim', async () => {
    expect(await read(`${col}/d1`, idToken('user-2', { admin: 'true' }))).toBe(DENIED);
  });

  it('denies every client write, even an admin (only the pipeline writes)', async () => {
    expect(await write(`${col}/d1`, ADMIN, { run_id: text('x') })).toBe(DENIED);
    expect(await create(col, 'd2', ADMIN, { run_id: text('d2') })).toBe(DENIED);
    expect(await remove(`${col}/d1`, ADMIN)).toBe(DENIED);
  });
});

describe.each(['ingestLocks', 'usage', 'users'])('%s (no client access)', (col) => {
  it('denies reads and writes for admins, users and anonymous callers', async () => {
    expect(await write(`${col}/d1`, SEED, { holder: text('run') })).toBe(OK);
    for (const caller of [ADMIN, USER, 'anonymous']) {
      expect(await read(`${col}/d1`, caller)).toBe(DENIED);
      expect(await write(`${col}/d1`, caller, { holder: text('me') })).toBe(DENIED);
      expect(await remove(`${col}/d1`, caller)).toBe(DENIED);
    }
  });
});

describe('collections without a rule (default deny)', () => {
  it('denies an unknown collection', async () => {
    expect(await write('somethingNew/d1', SEED, { a: text('b') })).toBe(OK);
    expect(await read('somethingNew/d1', ADMIN)).toBe(DENIED);
    expect(await create('somethingNew', 'd2', ADMIN, { a: text('b') })).toBe(DENIED);
  });
});

describe('funds (owner only, soft delete)', () => {
  const mine = { ownerUid: text('user-1'), name: text('Fund A') };

  it('lets the owner create and read a fund, and nobody else read it', async () => {
    expect(await create('funds', 'f1', USER, mine)).toBe(OK);
    expect(await read('funds/f1', USER)).toBe(OK);
    expect(await read('funds/f1', idToken('user-2'))).toBe(DENIED);
    expect(await read('funds/f1', 'anonymous')).toBe(DENIED);
  });

  it('rejects a fund created for someone else or with a bad name', async () => {
    expect(await create('funds', 'f1', USER, { ...mine, ownerUid: text('user-2') })).toBe(DENIED);
    expect(await create('funds', 'f2', USER, { ...mine, name: text('') })).toBe(DENIED);
    expect(await create('funds', 'f3', USER, { ...mine, name: text('x'.repeat(121)) })).toBe(
      DENIED,
    );
    expect(await create('funds', 'f4', USER, { ...mine, name: { booleanValue: true } })).toBe(
      DENIED,
    );
  });

  it('lets the owner update but never hand the fund over or delete it', async () => {
    expect(await create('funds', 'f1', USER, mine)).toBe(OK);
    expect(await write('funds/f1', USER, { ...mine, name: text('Fund B') })).toBe(OK);
    expect(await write('funds/f1', USER, { ...mine, ownerUid: text('user-2') })).toBe(DENIED);
    expect(await write('funds/f1', idToken('user-2'), mine)).toBe(DENIED);
    expect(await remove('funds/f1', USER)).toBe(DENIED);
  });
});
