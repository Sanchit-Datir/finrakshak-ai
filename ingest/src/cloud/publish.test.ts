import type { GateResult } from '@fund-tracker/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GraphOutputs } from '../pipeline/graph.js';
import { blobs } from '../storage/index.js';
import { freshFsStore } from '../test/tempData.js';
import { currentKey, publishVersion, readCurrent, rollbackToPrevious } from './publish.js';

const gates: GateResult[] = [{ id: 'g', passed: true, detail: 'ok' }];
const graph: GraphOutputs = {
  prefix: 'graph',
  index: [
    { file: 'graph-lab.json.gz', label: 'Real', synthetic: false },
    { file: 'test-data/seed-dhfl.json', label: 'Seed', synthetic: false },
  ],
  full: { nodes: [] } as unknown as GraphOutputs['full'],
};

async function writeGraph(content: string): Promise<void> {
  await blobs().write('graph/graph-lab.json.gz', `gz:${content}`);
  await blobs().write('graph/test-data/seed-dhfl.json', `{"c":"${content}"}`);
}

const publish = async (builtAt: string, keep = 14): Promise<string> =>
  (
    await publishVersion({
      channel: 'dry-run',
      graph,
      builtAt,
      runId: `run_${builtAt}`,
      rows: { entities: 1 },
      seedCases: ['dhfl'],
      gates,
      keep,
    })
  ).version;

beforeEach(() => {
  freshFsStore();
});

describe('publishVersion', () => {
  it('writes an immutable version folder and swaps the pointer', async () => {
    await writeGraph('one');
    const v = await publish('2026-10-17T03:05:00.000Z');
    expect(v).toBe('2026-10-17T03-05-00-000Z');
    const current = (await readCurrent('dry-run')).value;
    expect(current).toMatchObject({
      version: v,
      run_id: 'run_2026-10-17T03:05:00.000Z',
      seed_cases: ['dhfl'],
    });
    expect(current?.bundle_bytes).toBe('gz:one'.length);
    expect(
      (await blobs().read(`publish/dry-run/versions/${v}/graph-lab.json.gz`))?.data.toString(),
    ).toBe('gz:one');
    expect(await readCurrent('live')).toEqual({ value: null, generation: null });
  });

  it('never rewrites a version that already exists', async () => {
    await writeGraph('one');
    const v = await publish('2026-10-17T03:05:00.000Z');
    await writeGraph('two');
    await publish('2026-10-17T03:05:00.000Z');
    expect(
      (await blobs().read(`publish/dry-run/versions/${v}/graph-lab.json.gz`))?.data.toString(),
    ).toBe('gz:one');
  });

  it('keeps only the newest versions, never pruning the current one', async () => {
    await writeGraph('x');
    for (const day of ['15', '16', '17']) await publish(`2026-10-${day}T03:05:00.000Z`, 2);
    const folders = new Set(
      (await blobs().list('publish/dry-run/versions')).map((b) => b.key.split('/')[3]),
    );
    expect([...folders].sort()).toEqual(['2026-10-16T03-05-00-000Z', '2026-10-17T03-05-00-000Z']);
  });

  it('fails instead of overwriting when another publish changed the pointer (B-50)', async () => {
    await writeGraph('x');
    await publish('2026-10-16T03:05:00.000Z');
    const store = blobs();
    const realRead = store.read.bind(store);
    let first = true;
    // Another publisher swaps the pointer between this publish's read and its write.
    store.read = async (key) => {
      const out = await realRead(key);
      if (key === currentKey('dry-run') && first) {
        first = false;
        await store.write(key, (out?.data.toString() ?? '{}').replace('run_', 'run_other_'));
      }
      return out;
    };
    await expect(publish('2026-10-17T03:05:00.000Z')).rejects.toThrow(/Precondition failed/);
  });
});

describe('rollbackToPrevious', () => {
  it('repoints to the previous version, and returns null when there is none', async () => {
    await writeGraph('x');
    expect(await rollbackToPrevious('dry-run')).toBeNull();
    await publish('2026-10-16T03:05:00.000Z');
    expect(await rollbackToPrevious('dry-run')).toBeNull();
    await publish('2026-10-17T03:05:00.000Z');
    expect(await rollbackToPrevious('dry-run')).toBe('2026-10-16T03-05-00-000Z');
    expect((await readCurrent('dry-run')).value?.version).toBe('2026-10-16T03-05-00-000Z');
  });

  it('skips versions whose files were pruned', async () => {
    await writeGraph('x');
    await publish('2026-10-15T03:05:00.000Z');
    await publish('2026-10-16T03:05:00.000Z');
    await publish('2026-10-17T03:05:00.000Z');
    for (const b of await blobs().list('publish/dry-run/versions/2026-10-16T03-05-00-000Z'))
      await blobs().delete(b.key);
    expect(await rollbackToPrevious('dry-run')).toBe('2026-10-15T03-05-00-000Z');
  });
});
