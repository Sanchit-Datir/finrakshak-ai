import { createReadStream } from 'node:fs';
import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { z } from 'zod';

/** Reads a JSONL file, validating every row. Missing file → empty list. */
export async function readJsonl<T>(
  file: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T[]> {
  const rows: T[] = [];
  let lineNo = 0;
  try {
    const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      lineNo++;
      if (line.trim().length === 0) continue;
      const parsed: unknown = JSON.parse(line);
      rows.push(schema.parse(parsed));
    }
  } catch (e) {
    if (isNotFound(e)) return [];
    throw new Error(`Invalid JSONL ${file}:${lineNo}`, { cause: e });
  }
  return rows;
}

/** Atomically replaces a JSONL file. */
export async function writeJsonl(file: string, rows: readonly unknown[]): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  await rename(tmp, file);
}

export async function appendJsonl(file: string, row: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(row)}\n`);
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, file);
}

export function isNotFound(e: unknown): boolean {
  return e instanceof Error && 'code' in e && e.code === 'ENOENT';
}
