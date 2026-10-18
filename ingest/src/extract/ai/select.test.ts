import type { RawArtifact, SourceId } from '@finrakshak-ai/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { itemDocsKey, listingKey } from '../../acquire.js';
import { writeJson, writeJsonl } from '../../store/jsonl.js';
import { manifestKey } from '../../store/rawStore.js';
import { listingItem, shaOf } from '../../test/aiFixtures.js';
import { RUN_AT } from '../../test/fixtures.js';
import { freshFsStore, useTempDataDir } from '../../test/tempData.js';
import { textKey } from '../runExtract.js';
import { pendingDocuments } from './select.js';

useTempDataDir();

interface Doc {
  readonly id: string;
  readonly sha: string;
  readonly date?: string | null;
  /** Extracted characters (default 500); `null` = no text file at all. */
  readonly chars?: number | null;
  readonly needsOcr?: boolean;
}

const artifact = (source: SourceId, sha: string, url: string): RawArtifact => ({
  sha256: sha,
  source_id: source,
  url,
  final_url: url,
  retrieved_at: RUN_AT,
  http_status: 200,
  content_type: 'application/pdf',
  bytes: 1_000,
  path: `raw/${source}/files/${sha.slice(0, 2)}/${sha}.pdf`,
  terms_note: 'public record',
});

/** Writes a source's listing, resolved document links, raw manifest and extracted texts. */
async function seed(source: SourceId, docs: readonly Doc[]): Promise<void> {
  const url = (d: Doc): string => `https://example.org/${source}/${d.id}.pdf`;
  const date = (d: Doc): string | null => (d.date === undefined ? '2026-10-01' : d.date);
  await writeJsonl(
    listingKey(source),
    docs.map((d) =>
      listingItem({
        item_id: d.id,
        source_id: source,
        published_date: date(d),
        document_urls: [url(d)],
      }),
    ),
  );
  await writeJsonl(
    itemDocsKey(source),
    docs.map((d) => ({
      item_id: d.id,
      source_id: source,
      document_urls: [url(d)],
      resolved_at: RUN_AT,
    })),
  );
  await writeJsonl(
    manifestKey(source),
    docs.map((d) => artifact(source, d.sha, url(d))),
  );
  for (const d of docs) {
    const chars = d.chars === undefined ? 500 : d.chars;
    if (chars === null) continue;
    await writeJson(textKey(d.sha), {
      sha256: d.sha,
      method: 'pdfjs',
      pages: ['x'.repeat(chars)],
      chars,
      needs_ocr: d.needsOcr ?? false,
    });
  }
}

const shas = async (
  sources: readonly SourceId[],
  done: readonly string[],
  max: number,
): Promise<string[]> => (await pendingDocuments(sources, new Set(done), max)).map((d) => d.sha256);

beforeEach(() => {
  freshFsStore();
});

describe('pendingDocuments', () => {
  it('picks extracted documents not yet done for this prompt and model, newest first', async () => {
    await seed('ed', [
      { id: 'old', sha: shaOf(1), date: '2026-01-01' },
      { id: 'new', sha: shaOf(2), date: '2026-10-01' },
      { id: 'mid', sha: shaOf(3), date: '2026-05-01' },
      { id: 'done', sha: shaOf(4), date: '2026-10-02' },
    ]);
    const docs = await pendingDocuments(['ed'], new Set([shaOf(4)]), 10);
    expect(docs.map((d) => d.sha256)).toEqual([shaOf(2), shaOf(3), shaOf(1)]);
    expect(docs[0]).toMatchObject({
      url: 'https://example.org/ed/new.pdf',
      item: { item_id: 'new', source_id: 'ed' },
      text: { sha256: shaOf(2), chars: 500, needs_ocr: false },
    });
  });

  it('skips documents without usable text: missing, scanned (needs OCR) or under 300 characters', async () => {
    await seed('ed', [
      { id: 'short', sha: shaOf(1), chars: 299 },
      { id: 'enough', sha: shaOf(2), chars: 300 },
      { id: 'scanned', sha: shaOf(3), needsOcr: true },
      { id: 'no-text', sha: shaOf(4), chars: null },
    ]);
    expect(await shas(['ed'], [], 10)).toEqual([shaOf(2)]);
  });

  it('caps a run at max usable documents; skipped ones do not use up the cap (B-52)', async () => {
    await seed('ed', [
      { id: 'newest-empty', sha: shaOf(1), date: '2026-10-09', chars: null },
      { id: 'newest-short', sha: shaOf(2), date: '2026-10-08', chars: 10 },
      { id: 'a', sha: shaOf(3), date: '2026-10-07' },
      { id: 'b', sha: shaOf(4), date: '2026-10-06' },
      { id: 'c', sha: shaOf(5), date: '2026-10-05' },
    ]);
    expect(await shas(['ed'], [], 2)).toEqual([shaOf(3), shaOf(4)]);
    expect(await shas(['ed'], [], 0)).toEqual([]);
  });

  it('lists a checksum once when several items or sources share the document', async () => {
    await seed('ed', [{ id: 'ed-item', sha: shaOf(1), date: '2026-10-01' }]);
    await seed('sebi', [
      { id: 'sebi-item', sha: shaOf(1), date: '2026-10-05' },
      { id: 'sebi-copy', sha: shaOf(1), date: '2026-10-06' },
    ]);
    const docs = await pendingDocuments(['ed', 'sebi'], new Set(), 10);
    expect(docs.map((d) => [d.sha256, d.item.item_id])).toEqual([[shaOf(1), 'ed-item']]);
  });

  it('puts undated items after dated ones', async () => {
    await seed('rbi', [
      { id: 'undated', sha: shaOf(1), date: null },
      { id: 'dated', sha: shaOf(2), date: '2020-01-01' },
    ]);
    expect(await shas(['rbi'], [], 10)).toEqual([shaOf(2), shaOf(1)]);
  });

  it('returns nothing when no source has stored documents', async () => {
    expect(await shas([], [], 5)).toEqual([]);
    expect(await shas(['nfra'], [], 5)).toEqual([]);
  });

  it('fails loudly on a malformed text file instead of skipping it', async () => {
    await seed('ed', [{ id: 'bad', sha: shaOf(1), chars: null }]);
    await writeJson(textKey(shaOf(1)), { pages: 3 });
    await expect(pendingDocuments(['ed'], new Set(), 5)).rejects.toThrow(/Bad text file/);
  });
});
