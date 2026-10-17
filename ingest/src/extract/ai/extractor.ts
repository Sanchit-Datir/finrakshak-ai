import type { ToolModel } from '../../ai/toolModel.js';
import { errorMessage } from '../../log.js';
import { ground } from './ground.js';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM, renderDocument } from './prompt.js';
import {
  ModelExtractionSchema,
  RECORD_CLAIMS_PARAMETERS,
  type AiExtractionRecord,
} from './schema.js';
import type { PendingDocument } from './select.js';

export interface ExtractionLimits {
  /** Pages sent to the model (from the start of the document). */
  readonly maxPages: number;
  /** Characters sent to the model, a hard cost cap per document. */
  readonly maxChars: number;
}

const TOOL = {
  name: 'record_claims',
  description: 'Record the organisations, amounts, dates and case type found in the document.',
  parameters: RECORD_CLAIMS_PARAMETERS,
};

function pagesWithin(pages: readonly string[], limits: ExtractionLimits): string[] {
  const out: string[] = [];
  let left = limits.maxChars;
  for (const p of pages.slice(0, limits.maxPages)) {
    if (left <= 0) break;
    out.push(p.slice(0, left));
    left -= p.length;
  }
  return out;
}

export type ExtractionOutcome =
  | { readonly ok: true; readonly record: AiExtractionRecord }
  | { readonly ok: false; readonly error: string };

/**
 * One document, one forced `record_claims` call. Invalid output gets one corrective retry; then
 * the document is skipped (never guessed). Output is grounded against the full text.
 */
export async function extractDocument(
  model: ToolModel & { readonly id: string },
  doc: PendingDocument,
  limits: ExtractionLimits,
): Promise<ExtractionOutcome> {
  const user = renderDocument(
    { source: doc.item.source_id, title: doc.item.title },
    pagesWithin(doc.text.pages, limits),
  );
  const session = model.start(EXTRACTION_SYSTEM, user, [TOOL]);
  try {
    let calls = await session.step([]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const call = calls.find((c) => c.name === TOOL.name);
      const parsed = ModelExtractionSchema.safeParse(call?.args);
      if (parsed.success)
        return {
          ok: true,
          record: ground(parsed.data, {
            sha256: doc.sha256,
            item: doc.item,
            url: doc.url,
            pages: doc.text.pages,
            model: model.id,
            promptVersion: EXTRACTION_PROMPT_VERSION,
            extractedAt: new Date().toISOString(),
          }),
        };
      if (attempt === 1 || !call) break;
      calls = await session.step([
        { id: call.id, name: call.name, response: { error: parsed.error.message.slice(0, 500) } },
      ]);
    }
    return { ok: false, error: 'model did not return valid claims' };
  } catch (e) {
    return { ok: false, error: errorMessage(e).slice(0, 300) };
  }
}
