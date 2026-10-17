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
import { readJsonVersioned, sameAs, writeJson } from '../store/jsonl.js';

export const channelPrefix = (channel: PublishChannel): string => joinKey('publish', channel);
export const currentKey = (channel: PublishChannel): string =>
  joinKey(channelPrefix(channel), 'current.json');
const versionsPrefix = (channel: PublishChannel): string =>
  joinKey(channelPrefix(channel), 'versions');

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
  await writeJson(currentKey(req.channel), next, sameAs(current.generation));
  log.info('published', {
    channel: req.channel,
    version,
    previous: current.value?.version ?? null,
  });
  await pruneVersions(req.channel, version, req.keep);
  return next;
}

/** Points a channel back at an older version that still exists (rollback). */
export async function repoint(channel: PublishChannel, target: PublishedVersion): Promise<void> {
  const current = await readCurrent(channel);
  await writeJson(
    currentKey(channel),
    PublishedVersionSchema.parse(target),
    sameAs(current.generation),
  );
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
