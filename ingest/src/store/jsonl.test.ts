import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { freshFsStore } from '../test/tempData.js';
import { PreconditionFailedError } from '../storage/index.js';
import {
  appendLines,
  JsonlAppender,
  readJson,
  readJsonl,
  readJsonlVersioned,
  sameAs,
  writeJson,
  writeJsonl,
} from './jsonl.js';

const Row = z.object({ n: z.number() });

describe('JSONL store', () => {
  it('reads a missing key as empty with no generation, and writes back create-only', async () => {
    freshFsStore();
    const first = await readJsonlVersioned('l.jsonl', Row);
    expect(first).toEqual({ value: [], generation: null });
    await writeJsonl('l.jsonl', [{ n: 1 }], sameAs(first.generation));
    await expect(writeJsonl('l.jsonl', [{ n: 2 }], sameAs(null))).rejects.toBeInstanceOf(
      PreconditionFailedError,
    );
    expect(await readJsonl('l.jsonl', Row)).toEqual([{ n: 1 }]);
  });

  it('a writer that read an old version loses instead of overwriting (B-51)', async () => {
    freshFsStore();
    await writeJsonl('l.jsonl', [{ n: 1 }]);
    const a = await readJsonlVersioned('l.jsonl', Row);
    const b = await readJsonlVersioned('l.jsonl', Row);
    await writeJsonl('l.jsonl', [{ n: 2 }], sameAs(a.generation));
    await expect(writeJsonl('l.jsonl', [{ n: 3 }], sameAs(b.generation))).rejects.toBeInstanceOf(
      PreconditionFailedError,
    );
  });

  it('concurrent appends never lose lines', async () => {
    freshFsStore();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => appendLines('a.jsonl', [JSON.stringify({ n: i })])),
    );
    const rows = await readJsonl('a.jsonl', Row);
    expect(rows.map((r) => r.n).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('the appender batches and flushes everything', async () => {
    freshFsStore();
    const appender = new JsonlAppender('b.jsonl', 2);
    await appender.add({ n: 1 });
    expect(await readJsonl('b.jsonl', Row)).toEqual([]);
    await appender.add({ n: 2 });
    expect(await readJsonl('b.jsonl', Row)).toHaveLength(2);
    await appender.add({ n: 3 });
    await appender.flush();
    await appender.flush();
    expect(await readJsonl('b.jsonl', Row)).toHaveLength(3);
  });

  it('names the key and line of a malformed row, and rejects invalid JSON objects', async () => {
    const store = freshFsStore();
    await store.write('bad.jsonl', '{"n":1}\n{"n":"x"}\n');
    await expect(readJsonl('bad.jsonl', Row)).rejects.toThrow('Invalid JSONL bad.jsonl:2');
    await store.write('bad.json', '{oops');
    await expect(readJson('bad.json', Row)).rejects.toThrow('Invalid JSON bad.json');
    await writeJson('ok.json', { n: 5 });
    expect(await readJson('ok.json', Row)).toEqual({ n: 5 });
    expect(await readJson('none.json', Row)).toBeNull();
  });
});
