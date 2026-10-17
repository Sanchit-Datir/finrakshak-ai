import type { RawArtifact, SourceId } from '@fund-tracker/shared';
import { dataKey } from '../config.js';
import { errorMessage, log } from '../log.js';
import { blobs } from '../storage/index.js';
import { readJson, writeJson } from '../store/jsonl.js';
import { RawStore } from '../store/rawStore.js';
import { documentArtifacts } from './documentArtifacts.js';
import {
  ExtractedTextSchema,
  htmlToText,
  needsOcr,
  pdfToPages,
  type ExtractedText,
} from './text.js';

const TEXT_PREFIX = dataKey('interim', 'text');

export const textKey = (sha: string): string =>
  dataKey(TEXT_PREFIX, sha.slice(0, 2), `${sha}.json`);

export async function readText(sha: string): Promise<ExtractedText | null> {
  try {
    return await readJson(textKey(sha), ExtractedTextSchema);
  } catch (e) {
    throw new Error(`Bad text file for ${sha}`, { cause: e });
  }
}

/** Checksums that already have extracted text: one listing instead of one lookup per document. */
async function extractedChecksums(): Promise<Set<string>> {
  const done = new Set<string>();
  for (const info of await blobs().list(TEXT_PREFIX)) {
    const name = info.key.slice(info.key.lastIndexOf('/') + 1);
    if (name.endsWith('.json')) done.add(name.slice(0, -'.json'.length));
  }
  return done;
}

async function extractOne(store: RawStore, a: RawArtifact): Promise<ExtractedText> {
  const body = await store.body(a);
  const isPdf = /pdf/i.test(a.content_type) || body.subarray(0, 5).toString('latin1') === '%PDF-';
  const pages = isPdf ? await pdfToPages(body) : [htmlToText(body.toString('utf8'))];
  return {
    sha256: a.sha256,
    method: isPdf ? 'pdfjs' : 'html',
    pages,
    chars: pages.reduce((n, p) => n + p.length, 0),
    needs_ocr: isPdf && needsOcr(pages),
  };
}

export interface ExtractCounts {
  readonly done: number;
  readonly failed: number;
}

/** Extracts text for every downloaded document; idempotent per checksum. */
export async function extractAllText(sources: readonly SourceId[]): Promise<ExtractCounts> {
  const already = await extractedChecksums();
  let done = 0;
  let failed = 0;
  for (const source of sources) {
    const store = await RawStore.open(source);
    const before = { done, failed };
    for (const { artifact } of await documentArtifacts(source, store)) {
      if (already.has(artifact.sha256)) continue;
      try {
        await writeJson(textKey(artifact.sha256), await extractOne(store, artifact));
        already.add(artifact.sha256);
        done++;
      } catch (e) {
        failed++;
        log.warn('text extraction failed', { source, url: artifact.url, error: errorMessage(e) });
      }
    }
    log.info('text extracted', {
      source,
      done: done - before.done,
      failed: failed - before.failed,
    });
  }
  return { done, failed };
}
