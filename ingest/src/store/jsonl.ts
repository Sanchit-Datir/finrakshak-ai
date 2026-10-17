import type { z } from 'zod';
import {
  ABSENT,
  ANY,
  blobs,
  ifGeneration,
  PreconditionFailedError,
  type Generation,
  type WriteCondition,
} from '../storage/index.js';

type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

export interface Versioned<T> {
  readonly value: T;
  /** Null when the key did not exist (write back with `ABSENT`). */
  readonly generation: Generation | null;
}

function parseLines<T>(key: string, text: string, schema: Schema<T>): T[] {
  const rows: T[] = [];
  let lineNo = 0;
  for (const line of text.split('\n')) {
    lineNo++;
    if (line.trim().length === 0) continue;
    try {
      rows.push(schema.parse(JSON.parse(line)));
    } catch (e) {
      throw new Error(`Invalid JSONL ${key}:${lineNo}`, { cause: e });
    }
  }
  return rows;
}

/** Reads a JSONL object, validating every row, with the generation it was read at. */
export async function readJsonlVersioned<T>(
  key: string,
  schema: Schema<T>,
): Promise<Versioned<T[]>> {
  const blob = await blobs().read(key);
  if (!blob) return { value: [], generation: null };
  return {
    value: parseLines(key, blob.data.toString('utf8'), schema),
    generation: blob.generation,
  };
}

/** Reads a JSONL object, validating every row. Missing key → empty list. */
export async function readJsonl<T>(key: string, schema: Schema<T>): Promise<T[]> {
  return (await readJsonlVersioned(key, schema)).value;
}

const toJsonl = (rows: readonly unknown[]): string =>
  rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

/** Atomically replaces a JSONL object (optionally only if unchanged since it was read). */
export async function writeJsonl(
  key: string,
  rows: readonly unknown[],
  condition: WriteCondition = ANY,
): Promise<Generation> {
  return blobs().write(key, toJsonl(rows), { condition, contentType: 'application/x-ndjson' });
}

/** Condition that writes back over exactly the version that was read. */
export const sameAs = (generation: Generation | null): WriteCondition =>
  generation === null ? ABSENT : ifGeneration(generation);

const APPEND_ATTEMPTS = 10;

/** Jittered exponential backoff between append retries (10 ms, 20 ms, … up to ~1 s). */
const backoff = (attempt: number): Promise<void> =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.min(1_000, 10 * 2 ** attempt) * (0.5 + Math.random())),
  );

/**
 * Appends lines with read-modify-write under a generation precondition, retrying when another
 * writer got there first, so concurrent appends never lose lines.
 */
export async function appendLines(key: string, lines: readonly string[]): Promise<void> {
  if (lines.length === 0) return;
  const tail = `${lines.join('\n')}\n`;
  for (let attempt = 1; ; attempt++) {
    const current = await blobs().read(key);
    const head = current?.data.toString('utf8') ?? '';
    const sep = head.length > 0 && !head.endsWith('\n') ? '\n' : '';
    try {
      await blobs().write(key, head + sep + tail, {
        condition: sameAs(current?.generation ?? null),
        contentType: 'application/x-ndjson',
      });
      return;
    } catch (e) {
      if (!(e instanceof PreconditionFailedError) || attempt >= APPEND_ATTEMPTS) throw e;
      await backoff(attempt);
    }
  }
}

export async function appendJsonl(key: string, row: unknown): Promise<void> {
  await appendLines(key, [JSON.stringify(row)]);
}

/**
 * Buffers appends and writes them in batches (one round trip per batch instead of per row).
 * Callers must `flush()` when done; rows lost to a crash before a flush are re-created by the
 * next run because the pipeline is idempotent (e.g. a re-downloaded file has the same sha256).
 */
export class JsonlAppender {
  private pending: string[] = [];

  constructor(
    private readonly key: string,
    private readonly batchSize = 25,
  ) {}

  async add(row: unknown): Promise<void> {
    this.pending.push(JSON.stringify(row));
    if (this.pending.length >= this.batchSize) await this.flush();
  }

  async flush(): Promise<void> {
    const lines = this.pending;
    this.pending = [];
    await appendLines(this.key, lines);
  }
}

export async function readJson<T>(key: string, schema: Schema<T>): Promise<T | null> {
  return (await readJsonVersioned(key, schema)).value;
}

export async function readJsonVersioned<T>(
  key: string,
  schema: Schema<T>,
): Promise<Versioned<T | null>> {
  const blob = await blobs().read(key);
  if (!blob) return { value: null, generation: null };
  try {
    return {
      value: schema.parse(JSON.parse(blob.data.toString('utf8'))),
      generation: blob.generation,
    };
  } catch (e) {
    throw new Error(`Invalid JSON ${key}`, { cause: e });
  }
}

export async function writeJson(
  key: string,
  value: unknown,
  condition: WriteCondition = ANY,
): Promise<Generation> {
  return blobs().write(key, `${JSON.stringify(value, null, 2)}\n`, {
    condition,
    contentType: 'application/json',
  });
}

export function isNotFound(e: unknown): boolean {
  return e instanceof Error && 'code' in e && e.code === 'ENOENT';
}
