import type { PublishedVersion } from '@finrakshak-ai/shared';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';
import { getPublicDataConfig } from '../config/env.js';

/**
 * Reads what the cloud ingestion published (`<channel>/current.json` and the immutable version
 * folders) from the publish bucket. Functions are deployed without the workspace packages, so
 * the pointer is validated with this narrow schema; the type check below keeps it in step with
 * `PublishedVersion` in packages/shared (the single source of truth).
 */
const PointerSchema = z.object({
  version: z.string().regex(/^[0-9TZ-]+$/),
  built_at: z.string().datetime(),
  published_at: z.string().datetime(),
  files: z
    .array(z.object({ file: z.string().min(1), label: z.string(), synthetic: z.boolean() }))
    .min(1),
  rows: z.record(z.string(), z.number().int().nonnegative()),
});
export type Pointer = z.infer<typeof PointerSchema>;

type AssertTrue<T extends true> = T;
/** Compile-time guard: fails if `PublishedVersion` changes a field the function relies on. */
export type PointerInSync = AssertTrue<
  Pick<PublishedVersion, keyof Pointer> extends Pointer ? true : false
>;

/** Bundle files the app may request: plain relative paths only (B-44). */
const SAFE_FILE = /^(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9_./-]{0,200}$/;
const SAFE_VERSION = /^[0-9TZ-]{10,40}$/;

const POINTER_TTL_MS = 60_000;
let cache: { pointer: Pointer; at: number } | undefined;

/** Test helper: forget the cached pointer. */
export function resetPointerCache(): void {
  cache = undefined;
}

function bucket(): ReturnType<ReturnType<typeof getStorage>['bucket']> {
  return getStorage().bucket(getPublicDataConfig().bucket);
}

/** The currently published version, cached briefly so most requests cost no Storage read. */
export async function currentPointer(): Promise<Pointer | null> {
  if (cache && Date.now() - cache.at < POINTER_TTL_MS) return cache.pointer;
  const file = bucket().file(`${getPublicDataConfig().channel}/current.json`);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [data] = await file.download();
  // Parse, don't cast: the pointer is external data until validated.
  const pointer = PointerSchema.parse(JSON.parse(data.toString('utf8')));
  cache = { pointer, at: Date.now() };
  return pointer;
}

/** The app's index format, with each file under its immutable version folder. */
export function indexOf(pointer: Pointer): { file: string; label: string; synthetic: boolean }[] {
  return pointer.files.map((f) => ({ ...f, file: `versions/${pointer.version}/${f.file}` }));
}

export interface VersionFile {
  readonly stream: NodeJS.ReadableStream;
  readonly contentType: string;
  readonly size: number;
}

/** Opens `versions/<version>/<file>`; null when the path is not a published bundle file. */
export async function openVersionFile(version: string, file: string): Promise<VersionFile | null> {
  if (!SAFE_VERSION.test(version) || !SAFE_FILE.test(file)) return null;
  const object = bucket().file(`${getPublicDataConfig().channel}/versions/${version}/${file}`);
  const [exists] = await object.exists();
  if (!exists) return null;
  const [meta] = await object.getMetadata();
  return {
    stream: object.createReadStream(),
    contentType: meta.contentType ?? 'application/octet-stream',
    size: Number(meta.size ?? 0),
  };
}
