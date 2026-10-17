import { Timestamp, type DocumentReference } from '@google-cloud/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceIdSchema, type ExtractionRecord } from '@fund-tracker/shared';
import { buildRecord, RUN_AT, sourceRecord } from '../test/fixtures.js';
import { clearFirestore, emulatorFirestore } from '../test/emulator.js';
import { FirestoreLeaseManager, LEASE_COLLECTION } from './firestoreLease.js';
import { LeaseHeldError } from './lease.js';
import { FirestoreRunLog, RUN_COLLECTION } from './runLog.js';

const db = emulatorFirestore();
const MINUTE = 60_000;
const ALL_SOURCES = SourceIdSchema.options;

beforeEach(clearFirestore);
afterAll(() => db.terminate());

const leaseDoc = (name: string): DocumentReference => db.collection(LEASE_COLLECTION).doc(name);
const holderOf = async (name: string): Promise<unknown> => {
  const holder: unknown = (await leaseDoc(name).get()).get('holder');
  return holder;
};

describe('FirestoreLeaseManager (B-48, B-51)', () => {
  it('holds the lease while the work runs and releases it after', async () => {
    const lease = new FirestoreLeaseManager(db, 'run_a/0');
    const seen = await lease.withLease('source-ibbi', MINUTE, () => holderOf('source-ibbi'));
    expect(seen).toBe('run_a/0');
    expect((await leaseDoc('source-ibbi').get()).exists).toBe(false);
  });

  it('refuses a live lease held by another run and does not run the work', async () => {
    let ran = false;
    await new FirestoreLeaseManager(db, 'run_a/0').withLease('build', MINUTE, async () => {
      await expect(
        new FirestoreLeaseManager(db, 'run_b/0').withLease('build', MINUTE, () => {
          ran = true;
          return Promise.resolve();
        }),
      ).rejects.toBeInstanceOf(LeaseHeldError);
    });
    expect(ran).toBe(false);
  });

  it('takes over a lease whose holder crashed (expired)', async () => {
    await leaseDoc('build').set({
      holder: 'run_dead/0',
      acquired_at: '2026-10-16T03:05:00.000Z',
      expiresAt: Timestamp.fromMillis(Date.now() - MINUTE),
    });
    const out = await new FirestoreLeaseManager(db, 'run_b/0').withLease('build', MINUTE, () =>
      Promise.resolve('done'),
    );
    expect(out).toBe('done');
    expect((await leaseDoc('build').get()).exists).toBe(false);
  });

  it('releases the lease when the work throws', async () => {
    const lease = new FirestoreLeaseManager(db, 'run_a/0');
    await expect(
      lease.withLease('build', MINUTE, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect((await leaseDoc('build').get()).exists).toBe(false);
  });

  it("never deletes another holder's lease on release", async () => {
    await new FirestoreLeaseManager(db, 'run_a/0').withLease('build', MINUTE, async () => {
      // run_a overran its TTL and run_b took over in the meantime.
      await leaseDoc('build').set({
        holder: 'run_b/0',
        acquired_at: RUN_AT,
        expiresAt: Timestamp.fromMillis(Date.now() + MINUTE),
      });
    });
    expect(await holderOf('build')).toBe('run_b/0');
  });

  it('never lets two racing runs hold the lease at the same time', async () => {
    // Contended transactions retry with backoff, so a loser may still get the lease after the
    // winner released it; what must never happen is two holders at once.
    let holding = 0;
    let most = 0;
    const results = await Promise.allSettled(
      ['run_a/0', 'run_b/0', 'run_c/0', 'run_d/0'].map((holder) =>
        new FirestoreLeaseManager(db, holder).withLease('build', MINUTE, async () => {
          most = Math.max(most, ++holding);
          await new Promise((resolve) => setTimeout(resolve, 300));
          holding--;
        }),
      ),
    );
    expect(most).toBe(1);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    for (const r of results)
      if (r.status === 'rejected') expect(r.reason instanceof LeaseHeldError).toBe(true);
  });
});

describe('FirestoreRunLog', () => {
  const log = new FirestoreRunLog(db);
  const extraction: ExtractionRecord = {
    status: 'done',
    reason: 'shadow mode',
    model: 'mock',
    prompt_version: 'v1',
    documents: 2,
    claims: 3,
    failed: 0,
    dropped: 1,
    finished_at: RUN_AT,
  };

  it('returns null for a run that recorded nothing', async () => {
    expect(await log.get('run_none')).toBeNull();
  });

  it('merges each step into one document without overwriting the others', async () => {
    await log.recordSource('run_1', sourceRecord({ source_id: 'ibbi', added: 4 }));
    await log.recordBuild('run_1', buildRecord({ version: 'v7' }));
    await log.recordExtraction('run_1', extraction);
    await log.recordReview('run_1', { status: 'degraded', rerunSources: ['ed'] });
    await log.recordSource('run_1', sourceRecord({ source_id: 'ed', added: 1 }));
    const run = await log.get('run_1');
    expect(run?.sources['ibbi']?.added).toBe(4);
    expect(run?.sources['ed']?.added).toBe(1);
    expect(run).toMatchObject({
      build: { version: 'v7' },
      extraction: { claims: 3 },
      review_status: 'degraded',
      rerun_sources: ['ed'],
    });
  });

  it('keeps every source when the parallel acquire tasks record at the same time', async () => {
    await Promise.all(
      ALL_SOURCES.map((id) => log.recordSource('run_2', sourceRecord({ source_id: id }))),
    );
    expect(Object.keys((await log.get('run_2'))?.sources ?? {}).sort()).toEqual(
      [...ALL_SOURCES].sort(),
    );
  });

  it('validates before writing and when reading back', async () => {
    await expect(
      log.recordSource('run_3', sourceRecord({ source_id: 'ibbi', added: -1 })),
    ).rejects.toThrow();
    expect(await log.get('run_3')).toBeNull();
    await db
      .collection(RUN_COLLECTION)
      .doc('run_4')
      .set({ sources: { ibbi: { status: 'odd' } } });
    await expect(log.get('run_4')).rejects.toThrow();
  });
});
