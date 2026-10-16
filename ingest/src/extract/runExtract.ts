import { readFile, stat } from 'node:fs/promises';
import type { RawArtifact, SourceId } from '@fund-tracker/shared';
import { dataPath } from '../config.js';
import { errorMessage, log } from '../log.js';
import { isNotFound, writeJson } from '../store/jsonl.js';
import { RawStore } from '../store/rawStore.js';
import { documentArtifacts } from './documentArtifacts.js';
import {
  ExtractedTextSchema,
  htmlToText,
  needsOcr,
  pdfToPages,
  type ExtractedText,
} from './text.js';

export const textFile = (sha: string): string =>
  dataPath('interim', 'text', sha.slice(0, 2), `${sha}.json`);

export async function readText(sha: string): Promise<ExtractedText | null> {
  try {
    return ExtractedTextSchema.parse(JSON.parse(await readFile(textFile(sha), 'utf8')));
  } catch (e) {
    if (isNotFound(e)) return null;
    throw new Error(`Bad text file for ${sha}`, { cause: e });
  }
}

async function alreadyDone(sha: string): Promise<boolean> {
  try {
    await stat(textFile(sha));
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

async function extractOne(store: RawStore, a: RawArtifact): Promise<ExtractedText> {
  const body = await readFile(store.absolutePath(a));
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

/** Extracts text for every downloaded document; idempotent per checksum. */
export async function extractAllText(sources: readonly SourceId[]): Promise<void> {
  for (const source of sources) {
    const store = await RawStore.open(source);
    let done = 0;
    let failed = 0;
    for (const { artifact } of await documentArtifacts(source, store)) {
      if (await alreadyDone(artifact.sha256)) continue;
      try {
        await writeJson(textFile(artifact.sha256), await extractOne(store, artifact));
        done++;
      } catch (e) {
        failed++;
        log.warn('text extraction failed', { source, url: artifact.url, error: errorMessage(e) });
      }
    }
    log.info('text extracted', { source, done, failed });
  }
}
