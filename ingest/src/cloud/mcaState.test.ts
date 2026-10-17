import { beforeEach, describe, expect, it } from 'vitest';
import { blobs } from '../storage/index.js';
import { freshFsStore } from '../test/tempData.js';
import { mcaChanged } from './mcaState.js';

beforeEach(() => {
  freshFsStore();
});

describe('mcaChanged (manual MCA uploads trigger a rebuild)', () => {
  it('detects a new or replaced CSV part, and nothing after commit', async () => {
    expect((await mcaChanged()).changed).toBe(false);
    await blobs().write('raw/mca_ogd/company_master.part1of5.csv', 'CIN,NAME\n');
    const first = await mcaChanged();
    expect(first.changed).toBe(true);
    await first.commit();
    expect((await mcaChanged()).changed).toBe(false);
    await blobs().write('raw/mca_ogd/company_master.part1of5.csv', 'CIN,NAME\nU1,X\n');
    expect((await mcaChanged()).changed).toBe(true);
  });

  it('ignores files that are not CSV parts', async () => {
    await blobs().write('raw/mca_ogd/README.txt', 'notes');
    expect((await mcaChanged()).changed).toBe(false);
  });
});
