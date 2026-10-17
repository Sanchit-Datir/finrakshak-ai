import type { ExtractionRecord } from '@fund-tracker/shared';
import { readAiConfig, type AiConfig } from '../ai/config.js';
import { GeminiToolModel } from '../ai/geminiModel.js';
import { extractDocument } from '../extract/ai/extractor.js';
import { EXTRACTION_PROMPT_VERSION } from '../extract/ai/prompt.js';
import { pendingDocuments } from '../extract/ai/select.js';
import { extractedChecksums, saveExtraction } from '../extract/ai/store.js';
import { errorMessage, log } from '../log.js';
import { AUTOMATED_SOURCES } from '../pipeline/adapters.js';
import type { CloudDeps } from './context.js';
import type { CloudEnv } from './env.js';

const record = (
  fields: Omit<ExtractionRecord, 'finished_at' | 'prompt_version'>,
): ExtractionRecord => ({
  ...fields,
  prompt_version: EXTRACTION_PROMPT_VERSION,
  finished_at: new Date().toISOString(),
});

/** Why extraction does not run; null when it should. A mock model writes nothing (no fake claims). */
function skipReason(cfg: AiConfig): string | null {
  if (!cfg.extraction.enabled)
    return 'AI extraction is switched off (FUNDTRACE_AI_EXTRACT_ENABLED)';
  if (!cfg.enabled) return 'agent kill switch is on (FUNDTRACE_AGENT_ENABLED=false)';
  if (cfg.provider === 'mock') return 'mock provider: nothing is extracted or stored';
  return null;
}

async function extractPending(cfg: AiConfig): Promise<ExtractionRecord> {
  const model = new GeminiToolModel(cfg);
  const done = await extractedChecksums(EXTRACTION_PROMPT_VERSION, model.id);
  const docs = await pendingDocuments(AUTOMATED_SOURCES, done, cfg.extraction.maxDocs);
  let ok = 0;
  let failed = 0;
  let claims = 0;
  let dropped = 0;
  for (const doc of docs) {
    const out = await extractDocument(model, doc, cfg.extraction);
    if (!out.ok) {
      failed++;
      log.warn('ai extraction failed', {
        sha256: doc.sha256,
        source: doc.item.source_id,
        error: out.error,
      });
      continue;
    }
    await saveExtraction(out.record);
    ok++;
    claims += out.record.rows.length;
    dropped +=
      out.record.dropped.ungrounded +
      out.record.dropped.not_organisation +
      out.record.dropped.unparsed_amount;
  }
  return record({
    status: failed > 0 && ok === 0 && docs.length > 0 ? 'failed' : 'done',
    reason: `${docs.length} pending documents (cap ${cfg.extraction.maxDocs})`,
    model: model.id,
    documents: ok,
    claims,
    failed,
    dropped,
  });
}

/**
 * Cloud Run task between acquire and build: extracts structured claims from new documents with
 * the model, in shadow mode (B-52). Its identity can only create objects, so it cannot alter
 * listings, raw evidence or published data; the build loads its output into a shadow table.
 */
export async function runExtractTask(env: CloudEnv, deps: CloudDeps): Promise<boolean> {
  const cfg = readAiConfig();
  const reason = skipReason(cfg);
  let result: ExtractionRecord;
  if (reason !== null)
    result = record({
      status: 'skipped',
      reason,
      model: null,
      documents: 0,
      claims: 0,
      failed: 0,
      dropped: 0,
    });
  else
    try {
      result = await extractPending(cfg);
    } catch (e) {
      result = record({
        status: 'failed',
        reason: errorMessage(e).slice(0, 500),
        model: cfg.model,
        documents: 0,
        claims: 0,
        failed: 0,
        dropped: 0,
      });
    }
  await deps.runs.recordExtraction(env.runId, result);
  log.info('ai extraction recorded', { run: env.runId, ...result });
  return result.status !== 'failed';
}
