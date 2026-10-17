import type { ListingItem, SourceId } from '@fund-tracker/shared';
import { RawStore } from '../../store/rawStore.js';
import { documentArtifacts } from '../documentArtifacts.js';
import { readText } from '../runExtract.js';
import type { ExtractedText } from '../text.js';

export interface PendingDocument {
  readonly sha256: string;
  readonly url: string;
  readonly item: ListingItem;
  readonly text: ExtractedText;
}

/** Too little text to be worth a model call (cover pages, empty HTML). */
const MIN_CHARS = 300;

/**
 * Documents with extracted text that this prompt version and model have not processed yet,
 * newest first, at most `max` (the per-run cost cap).
 */
export async function pendingDocuments(
  sources: readonly SourceId[],
  done: ReadonlySet<string>,
  max: number,
): Promise<PendingDocument[]> {
  const candidates = new Map<string, { url: string; item: ListingItem }>();
  for (const source of sources) {
    const store = await RawStore.open(source);
    for (const { item, url, artifact } of await documentArtifacts(source, store))
      if (!done.has(artifact.sha256) && !candidates.has(artifact.sha256))
        candidates.set(artifact.sha256, { url, item });
  }
  const ordered = [...candidates.entries()].sort(([, a], [, b]) =>
    (b.item.published_date ?? '').localeCompare(a.item.published_date ?? ''),
  );
  const out: PendingDocument[] = [];
  for (const [sha256, c] of ordered) {
    if (out.length >= max) break;
    const text = await readText(sha256);
    if (text && !text.needs_ocr && text.chars >= MIN_CHARS) out.push({ sha256, ...c, text });
  }
  return out;
}
