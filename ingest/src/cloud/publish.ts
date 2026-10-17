import {
  PublishedVersionSchema,
  type GateResult,
  type GraphLabIndexEntry,
  type PublishChannel,
  type PublishedVersion,
} from '@fund-tracker/shared';
import { stamp } from '../delta/report.js';
import { log } from '../log.js';
import type { GraphOutputs } from '../pipeline/graph.js';
import { ABSENT, blobs, joinKey, PreconditionFailedError } from '../storage/index.js';
import { readJson, readJsonVersioned, sameAs, writeJson } from '../store/jsonl.js';

export const channelPrefix = (channel: PublishChannel): string => joinKey('publish', channel);
export const currentKey = (channel: PublishChannel): string =>
  joinKey(channelPrefix(channel), 'current.json');
const versionsPrefix = (channel: PublishChannel): string =>
  joinKey(channelPrefix(channel), 'versions');
/** Every pointer ever published, so a rollback can restore the exact previous one. */
const historyKey = (channel: PublishChannel, version: string): string =>
  joinKey(channelPrefix(channel), 'history', `${version}.json`);

/** The version the app serves on a channel, with the generation needed to replace it safely. */
export async function readCurrent(
  channel: PublishChannel,
): Promise<{ value: PublishedVersion | null; generation: string | null }> {
  return readJsonVersioned(currentKey(channel), PublishedVersionSchema);
}

const CONTENT_TYPES: readonly (readonly [RegExp, string])[] = [
  [/\.gz$/, 'application/gzip'],
  [/\.json$/, 'application/json'],
];

async function copyCreateOnly(from: string, to: string): Promise<number> {
  const blob = await blobs().read(from);
  if (!blob) throw new Error(`Missing graph output ${from}`);
  const contentType = CONTENT_TYPES.find(([re]) => re.test(to))?.[1] ?? 'application/octet-stream';
  try {
    // Versions are immutable once written; the browser may cache them for a long time.
    await blobs().write(to, blob.data, {
      condition: ABSENT,
      contentType,
      cacheControl: 'private, max-age=31536000, immutable',
    });
  } catch (e) {
    if (!(e instanceof PreconditionFailedError)) throw e;
  }
  return blob.data.length;
}

export interface PublishRequest {
  readonly channel: PublishChannel;
  readonly graph: GraphOutputs;
  readonly builtAt: string;
  readonly runId: string;
  readonly rows: Readonly<Record<string, number>>;
  readonly seedCases: readonly string[];
  readonly gates: readonly GateResult[];
  readonly keep: number;
}

/**
 * Publishes a gated build: copies the bundles into an immutable version folder, then swaps the
 * channel's `current.json` pointer with a compare-and-swap (a concurrent publish fails instead of
 * being overwritten). Old versions beyond `keep` are pruned; the current one never is.
 */
export async function publishVersion(req: PublishRequest): Promise<PublishedVersion> {
  const version = stamp(req.builtAt);
  const folder = joinKey(versionsPrefix(req.channel), version);
  const files: GraphLabIndexEntry[] = req.graph.index.map((e) => ({ ...e }));
  let bundleBytes = 0;
  for (const entry of files) {
    const bytes = await copyCreateOnly(
      joinKey(req.graph.prefix, entry.file),
      joinKey(folder, entry.file),
    );
    if (!entry.synthetic && entry.file.endsWith('.json.gz')) bundleBytes = bytes;
  }
  const current = await readCurrent(req.channel);
  const next = PublishedVersionSchema.parse({
    version,
    built_at: req.builtAt,
    published_at: new Date().toISOString(),
    run_id: req.runId,
    files,
    rows: req.rows,
    seed_cases: req.seedCases,
    bundle_bytes: bundleBytes,
    gates: req.gates,
  });
  await writeJson(historyKey(req.channel, version), next);
  await writeJson(currentKey(req.channel), next, sameAs(current.generation));
  log.info('published', {
    channel: req.channel,
    version,
    previous: current.value?.version ?? null,
  });
  await pruneVersions(req.channel, version, req.keep);
  return next;
}

/**
 * Rollback: points the channel at the newest earlier version whose files still exist. Returns the
 * version now served, or null when there is nothing to go back to.
 */
export async function rollbackToPrevious(channel: PublishChannel): Promise<string | null> {
  const current = await readCurrent(channel);
  if (!current.value) return null;
  const keys = (await blobs().list(joinKey(channelPrefix(channel), 'history'))).map((b) => b.key);
  for (const key of keys.sort().reverse()) {
    const candidate = await readJson(key, PublishedVersionSchema);
    if (!candidate || candidate.version >= current.value.version) continue;
    const first = candidate.files[0];
    const folder = joinKey(versionsPrefix(channel), candidate.version);
    if (!first || !(await blobs().stat(joinKey(folder, first.file)))) continue;
    const restored = { ...candidate, published_at: new Date().toISOString() };
    await writeJson(currentKey(channel), restored, sameAs(current.generation));
    log.warn('rolled back', { channel, from: current.value.version, to: candidate.version });
    return candidate.version;
  }
  return null;
}

async function pruneVersions(
  channel: PublishChannel,
  current: string,
  keep: number,
): Promise<void> {
  const prefix = versionsPrefix(channel);
  const objects = await blobs().list(prefix);
  const versionOf = (key: string): string => key.slice(prefix.length + 1).split('/')[0] ?? '';
  const versions = [...new Set(objects.map((o) => versionOf(o.key)))].filter(Boolean).sort();
  const stale = new Set(versions.slice(0, Math.max(0, versions.length - keep)));
  stale.delete(current);
  for (const o of objects) if (stale.has(versionOf(o.key))) await blobs().delete(o.key);
  if (stale.size > 0) log.info('pruned old versions', { channel, removed: stale.size });
}
