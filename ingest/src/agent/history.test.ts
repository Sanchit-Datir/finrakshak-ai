import { beforeEach, describe, expect, it } from 'vitest';
import { BlobRunLog } from '../coordination/runLog.js';
import { freshFsStore } from '../test/tempData.js';
import { sourceRecord } from '../test/fixtures.js';
import { BlobHistory } from './history.js';

beforeEach(() => {
  freshFsStore();
});

describe('BlobHistory', () => {
  it('returns one source within the window, newest first', async () => {
    const log = new BlobRunLog();
    const now = Date.now();
    const at = (daysAgo: number): string => new Date(now - daysAgo * 86_400_000).toISOString();
    await log.recordSource('run_a', sourceRecord({ source_id: 'ibbi', run_at: at(2), added: 2 }));
    await log.recordSource('run_b', sourceRecord({ source_id: 'ibbi', run_at: at(1), added: 1 }));
    await log.recordSource('run_c', sourceRecord({ source_id: 'ibbi', run_at: at(40) }));
    await log.recordSource('run_b', sourceRecord({ source_id: 'ed', run_at: at(1) }));
    const rows = await new BlobHistory().recent('ibbi', 30);
    expect(rows.map((r) => [r.run_id, r.added])).toEqual([
      ['run_b', 1],
      ['run_a', 2],
    ]);
  });
});
