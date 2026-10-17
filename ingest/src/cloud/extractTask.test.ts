import type { ExtractionRecord, ListingItem } from '@fund-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCall, ToolSession, Usage } from '../ai/toolModel.js';
import { assess, statusOf } from '../agent/findings.js';
import { BlobHistory } from '../agent/history.js';
import { BlobAgentStore } from '../agent/store.js';
import { BlobRunLog } from '../coordination/runLog.js';
import { EXTRACTION_PROMPT_VERSION } from '../extract/ai/prompt.js';
import type * as SelectModule from '../extract/ai/select.js';
import { pendingDocuments, type PendingDocument } from '../extract/ai/select.js';
import { allExtractions, extractedChecksums } from '../extract/ai/store.js';
import { AUTOMATED_SOURCES } from '../pipeline/adapters.js';
import { buildRecord, RUN_AT } from '../test/fixtures.js';
import { freshFsStore, useTempDataDir } from '../test/tempData.js';
import type { CloudDeps } from './context.js';
import { readCloudEnv } from './env.js';
import { runExtractTask } from './extractTask.js';
import { MemoryAgentRunStore } from '../ai/agentRuns.js';

interface ModelScript {
  created: number;
  /** `record_claims` arguments for an ordinary document. */
  args: unknown;
}

/**
 * Stand-in for Gemini: answers every document with `record_claims`; a listing title containing
 * `TEST invalid` gets schema-breaking output, `TEST unavailable` a failed call.
 */
const model = vi.hoisted((): ModelScript => ({ created: 0, args: null }));

vi.mock('../ai/geminiModel.js', () => ({
  GeminiToolModel: class {
    readonly id: string;

    constructor(cfg: { readonly model: string }) {
      this.id = cfg.model;
      model.created++;
    }

    start(_system: string, user: string): ToolSession {
      return {
        step: (): Promise<ToolCall[]> => {
          if (user.includes('TEST unavailable'))
            return Promise.reject(new Error('429 Too Many Requests'));
          const args = user.includes('TEST invalid') ? { organisations: 'none' } : model.args;
          return Promise.resolve([{ id: 'c1', name: 'record_claims', args }]);
        },
        usage: (): Usage => ({ inputTokens: 0, outputTokens: 0 }),
      };
    }
  },
}));
// Document selection reads raw stores and text files; the tests hand it documents directly.
vi.mock('../extract/ai/select.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SelectModule>()),
  pendingDocuments: vi.fn(),
}));

useTempDataDir('fundtrace-extract-task-');

const RUN_ID = 'run_t';
const MODEL = 'gemini-test-model';
const TEXT =
  'SYNTH order. Adjudication order in the matter of Example Traders Private Limited. ' +
  'A penalty of Rs. 5 crore is imposed on Example Traders Private Limited. Shri Ramesh Kumar appeared.';

const VALID = {
  organisations: [
    { name: 'Example Traders Private Limited', cin: null, role: 'subject_of_action', page: 1 },
    // An individual (B-38) and a name the document never prints: both dropped by grounding.
    { name: 'Ramesh Kumar', cin: null, role: 'other', page: 1 },
    { name: 'Imaginary Bank Limited', cin: null, role: 'lender_or_creditor', page: 1 },
  ],
  amounts: [{ amount_text: 'Rs. 5 crore', about: 'penalty', page: 1 }],
  dates: [],
  case_type: 'penalty',
  summary: 'SYNTH penalty order.',
};

function doc(n: number, title = `SYNTH order ${n}`): PendingDocument {
  const sha256 = `${'a'.repeat(63)}${n}`;
  const url = `https://www.sebi.gov.in/enforcement/orders/oct-2026/synth-order-${n}.html`;
  const item: ListingItem = {
    item_id: `sebi_${n}`,
    source_id: 'sebi',
    collection: 'sebi.orders.orders_of_ao',
    title,
    detail_url: url,
    document_urls: [],
    published_date: '2026-10-16',
    fields: { order_type: 'sebi.orders.orders_of_ao', sat_appeal: '' },
    listed_at: RUN_AT,
  };
  const text = {
    sha256,
    method: 'html' as const,
    pages: [TEXT],
    chars: TEXT.length,
    needs_ocr: false,
  };
  return { sha256, url, item, text };
}

const deps: CloudDeps = {
  leases: { withLease: () => Promise.reject(new Error('the extractor takes no lease')) },
  runs: new BlobRunLog(),
  agent: new BlobAgentStore(),
  history: new BlobHistory(),
  agentRuns: new MemoryAgentRunStore(),
};
const env = readCloudEnv({ FUNDTRACE_RUN_ID: RUN_ID, FUNDTRACE_RUN_AT: RUN_AT });

async function extractionRecord(): Promise<ExtractionRecord | null> {
  return (await deps.runs.get(RUN_ID))?.extraction ?? null;
}

/** Extraction on, with a billed provider (here the stand-in above). */
function switchOn(): void {
  vi.stubEnv('FUNDTRACE_AI_EXTRACT_ENABLED', 'true');
  vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
  vi.stubEnv('FUNDTRACE_AGENT_ENABLED', 'true');
  vi.stubEnv('FUNDTRACE_AI_MODEL', MODEL);
}

beforeEach(() => {
  freshFsStore();
  model.created = 0;
  model.args = VALID;
  vi.mocked(pendingDocuments)
    .mockReset()
    .mockResolvedValue([doc(1)]);
  vi.stubEnv('FUNDTRACE_AI_EXTRACT_ENABLED', 'false');
  vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'mock');
  vi.stubEnv('FUNDTRACE_AGENT_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runExtractTask: skip reasons (B-52)', () => {
  it.each([
    [
      'extraction is off (the default)',
      {},
      'AI extraction is switched off (FUNDTRACE_AI_EXTRACT_ENABLED)',
    ],
    [
      'the agent kill switch is on',
      {
        FUNDTRACE_AI_EXTRACT_ENABLED: 'true',
        FUNDTRACE_AI_PROVIDER: 'vertex',
        FUNDTRACE_AGENT_ENABLED: 'false',
      },
      'agent kill switch is on (FUNDTRACE_AGENT_ENABLED=false)',
    ],
    [
      'the provider is the mock',
      { FUNDTRACE_AI_EXTRACT_ENABLED: 'true' },
      'mock provider: nothing is extracted or stored',
    ],
  ])('skips when %s, without creating a model', async (_label, vars, reason) => {
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
    expect(await runExtractTask(env, deps)).toBe(true);
    expect(await extractionRecord()).toMatchObject({
      status: 'skipped',
      reason,
      model: null,
      prompt_version: EXTRACTION_PROMPT_VERSION,
      documents: 0,
      claims: 0,
      failed: 0,
      dropped: 0,
    });
    expect(model.created).toBe(0);
    expect(vi.mocked(pendingDocuments)).not.toHaveBeenCalled();
    expect(await allExtractions()).toEqual([]);
  });
});

describe('runExtractTask: extraction with a (mocked) model', () => {
  it('writes grounded shadow claims and records the counts', async () => {
    switchOn();
    expect(await runExtractTask(env, deps)).toBe(true);
    expect(await extractionRecord()).toMatchObject({
      status: 'done',
      reason: '1 pending documents (cap 50)',
      model: MODEL,
      documents: 1,
      claims: 3,
      failed: 0,
      dropped: 2,
    });
    const [stored] = await allExtractions();
    expect(stored?.rows.map((r) => [r.kind, r.name ?? r.amount_text ?? r.about])).toEqual([
      ['organisation', 'Example Traders Private Limited'],
      ['amount', 'Rs. 5 crore'],
      ['case_type', 'penalty'],
    ]);
    expect(stored?.dropped).toEqual({ ungrounded: 1, not_organisation: 1, unparsed_amount: 0 });
    // Amounts become integer paise by code (B-01).
    expect(stored?.rows[1]?.amount).toEqual({ minor: 5_000_000_000, currency: 'INR' });
  });

  it('asks only for documents this prompt version and model have not extracted yet', async () => {
    switchOn();
    await runExtractTask(env, deps);
    await runExtractTask(env, deps);
    const done = vi.mocked(pendingDocuments).mock.calls.map(([, d]) => [...d]);
    expect(done).toEqual([[], [doc(1).sha256]]);
    expect(vi.mocked(pendingDocuments).mock.calls[0]?.[0]).toEqual(AUTOMATED_SOURCES);
    expect(await extractedChecksums(EXTRACTION_PROMPT_VERSION, MODEL)).toEqual(
      new Set([doc(1).sha256]),
    );
  });

  it('counts documents the model failed on and carries on with the rest', async () => {
    switchOn();
    vi.mocked(pendingDocuments).mockResolvedValue([
      doc(1),
      doc(2, 'TEST invalid output'),
      doc(3, 'TEST unavailable model'),
    ]);
    expect(await runExtractTask(env, deps)).toBe(true);
    expect(await extractionRecord()).toMatchObject({ status: 'done', documents: 1, failed: 2 });
    expect((await allExtractions()).map((r) => r.sha256)).toEqual([doc(1).sha256]);
  });

  it('records the step as failed when every document failed, without throwing', async () => {
    switchOn();
    vi.mocked(pendingDocuments).mockResolvedValue([doc(2, 'TEST invalid output')]);
    await expect(runExtractTask(env, deps)).resolves.toBe(false);
    const extraction = await extractionRecord();
    expect(extraction).toMatchObject({ status: 'failed', documents: 0, claims: 0, failed: 1 });
    expect(await allExtractions()).toEqual([]);
    // Shadow mode: a failed extraction degrades the run review but never fails the run.
    const run = {
      run_id: RUN_ID,
      sources: {},
      build: buildRecord(),
      extraction,
      rerun_sources: [],
      review_status: null,
    };
    const findings = assess(run, new Map(), RUN_AT).findings;
    expect(findings.map((f) => [f.code, f.severity])).toEqual([['ai_extraction_failed', 'warn']]);
    expect(statusOf(findings)).toBe('degraded');
  });

  it('records a failure of the step itself (e.g. an unreadable text file)', async () => {
    switchOn();
    vi.mocked(pendingDocuments).mockRejectedValue(
      new Error('Bad text file for abc', { cause: new Error('Invalid JSON') }),
    );
    expect(await runExtractTask(env, deps)).toBe(false);
    expect(await extractionRecord()).toMatchObject({
      status: 'failed',
      reason: 'Bad text file for abc (cause: Invalid JSON)',
      model: MODEL,
      documents: 0,
    });
  });

  it('is done (not failed) when nothing is pending', async () => {
    switchOn();
    vi.mocked(pendingDocuments).mockResolvedValue([]);
    expect(await runExtractTask(env, deps)).toBe(true);
    expect(await extractionRecord()).toMatchObject({ status: 'done', documents: 0, failed: 0 });
  });
});
