import { dataKey } from '../../config.js';
import { ABSENT, blobs, PreconditionFailedError } from '../../storage/index.js';
import { readJson, writeJson, writeJsonl } from '../../store/jsonl.js';
import { log } from '../../log.js';
import { AiExtractionRecordSchema, type AiClaimRow, type AiExtractionRecord } from './schema.js';

const CLAIMS_PREFIX = dataKey('interim', 'ai', 'claims');

/** Model ids become a path segment: keep it to safe characters. */
const segment = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_');

/** One object per document, prompt version and model: a new prompt or model re-extracts. */
export const claimsKey = (promptVersion: string, model: string, sha: string): string =>
  dataKey(CLAIMS_PREFIX, segment(promptVersion), segment(model), sha.slice(0, 2), `${sha}.json`);

/** Checksums already extracted with this prompt version and model. */
export async function extractedChecksums(
  promptVersion: string,
  model: string,
): Promise<Set<string>> {
  const prefix = dataKey(CLAIMS_PREFIX, segment(promptVersion), segment(model));
  const done = new Set<string>();
  for (const b of await blobs().list(prefix)) {
    const name = b.key.slice(b.key.lastIndexOf('/') + 1);
    if (name.endsWith('.json')) done.add(name.slice(0, -'.json'.length));
  }
  return done;
}

/**
 * Create-only: the extractor's identity may add objects but never overwrite or delete them, so
 * an extraction cannot change existing pipeline state. A second write of the same key is a no-op.
 */
export async function saveExtraction(record: AiExtractionRecord): Promise<void> {
  try {
    await writeJson(
      claimsKey(record.prompt_version, record.model, record.sha256),
      AiExtractionRecordSchema.parse(record),
      ABSENT,
    );
  } catch (e) {
    if (!(e instanceof PreconditionFailedError)) throw e;
  }
}

export async function allExtractions(): Promise<AiExtractionRecord[]> {
  const out: AiExtractionRecord[] = [];
  for (const b of await blobs().list(CLAIMS_PREFIX)) {
    if (!b.key.endsWith('.json')) continue;
    const r = await readJson(b.key, AiExtractionRecordSchema);
    if (r) out.push(r);
  }
  return out;
}

export const shadowTableKey = dataKey('processed', 'ai_claims_shadow.jsonl');

/** Flattens every stored extraction into the shadow table file (loaded by the build). */
export async function writeShadowTable(): Promise<AiClaimRow[]> {
  const rows = (await allExtractions()).flatMap((r) => r.rows);
  await writeJsonl(shadowTableKey, rows);
  log.info('ai shadow claims written', { rows: rows.length });
  return rows;
}
