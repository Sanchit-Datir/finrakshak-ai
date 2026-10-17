import { describe, expect, it } from 'vitest';
import type { ToolCall, ToolModel, ToolResult, ToolSpec } from '../../ai/toolModel.js';
import { ModelError } from '../../ai/toolModel.js';
import { DOC_URL, listingItem, SHA } from '../../test/aiFixtures.js';
import { extractDocument, type ExtractionLimits } from './extractor.js';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM } from './prompt.js';
import { RECORD_CLAIMS_PARAMETERS } from './schema.js';
import type { PendingDocument } from './select.js';

interface Seen {
  system: string;
  user: string;
  tools: readonly ToolSpec[];
  results: ToolResult[][];
}

/** A model that replays scripted steps and records what it was sent. */
function scripted(
  steps: ToolCall[][],
  fail?: Error,
): { model: ToolModel & { readonly id: string }; seen: Seen } {
  const seen: Seen = { system: '', user: '', tools: [], results: [] };
  const model: ToolModel & { readonly id: string } = {
    id: 'gemini-test',
    start: (system, user, tools) => {
      Object.assign(seen, { system, user, tools });
      let i = 0;
      return {
        step: (results) => {
          seen.results.push([...results]);
          if (fail) return Promise.reject(fail);
          return Promise.resolve(steps[i++] ?? []);
        },
        usage: () => ({ inputTokens: 0, outputTokens: 0 }),
      };
    },
  };
  return { model, seen };
}

const PAGES = [
  'Order against Example Finance Limited for Rs. 62.70 crore.',
  'Page two names State Bank of India.',
  'Page three: a further Rs. 10 lakh.',
];
const DOC: PendingDocument = {
  sha256: SHA,
  url: DOC_URL,
  item: listingItem(),
  text: { sha256: SHA, method: 'pdfjs', pages: PAGES, chars: 120, needs_ocr: false },
};
const LIMITS: ExtractionLimits = { maxPages: 10, maxChars: 30_000 };
const CLAIMS = {
  organisations: [
    { name: 'Example Finance Limited', cin: null, role: 'subject_of_action', page: 1 },
  ],
  amounts: [{ amount_text: 'Rs. 10 lakh', about: 'attached', page: 3 }],
  dates: [],
  case_type: 'attachment',
  summary: 'ED attached assets.',
};
const record = (args: unknown, id = 'c1'): ToolCall => ({ id, name: 'record_claims', args });

describe('extractDocument', () => {
  it('forces one record_claims call and grounds the valid output', async () => {
    const { model, seen } = scripted([[record(CLAIMS)]]);
    const out = await extractDocument(model, DOC, LIMITS);
    expect(seen.system).toBe(EXTRACTION_SYSTEM);
    expect(seen.tools).toHaveLength(1);
    expect(seen.tools[0]?.name).toBe('record_claims');
    expect(seen.tools[0]?.parameters).toEqual(RECORD_CLAIMS_PARAMETERS);
    expect(seen.tools[0]?.description.length).toBeGreaterThan(0);
    expect(seen.user).toContain('Source: ed');
    expect(seen.user).toContain(`Listing title: ${DOC.item.title}`);
    expect(seen.results).toEqual([[]]);
    if (!out.ok) throw new Error(out.error);
    expect(out.record).toMatchObject({
      sha256: SHA,
      model: 'gemini-test',
      prompt_version: EXTRACTION_PROMPT_VERSION,
      case_type: 'attachment',
    });
    expect(Date.parse(out.record.extracted_at)).not.toBeNaN();
    expect(out.record.rows.map((r) => r.kind)).toEqual(['organisation', 'amount', 'case_type']);
  });

  it('sends at most maxPages pages and maxChars characters (B-52 cost cap)', async () => {
    const pages = await sentPages({ maxPages: 2, maxChars: 30_000 });
    expect(pages).toEqual([PAGES[0], PAGES[1]]);
    const capped = await sentPages({ maxPages: 10, maxChars: 70 });
    expect(capped.join('')).toHaveLength(70);
    expect(capped).toEqual([PAGES[0], PAGES[1]?.slice(0, 70 - (PAGES[0]?.length ?? 0))]);
  });

  it('grounds against the full document, not only the pages that were sent', async () => {
    const { model } = scripted([[record(CLAIMS)]]);
    const out = await extractDocument(model, DOC, { maxPages: 1, maxChars: 30_000 });
    expect(out.ok && out.record.rows.find((r) => r.kind === 'amount')?.amount).toEqual({
      minor: 100_000_000,
      currency: 'INR',
    });
  });

  it('gives invalid output one corrective retry that echoes the call and the error', async () => {
    const { model, seen } = scripted([
      [record({ ...CLAIMS, case_type: 'verdict' }, 'bad')],
      [record(CLAIMS)],
    ]);
    const out = await extractDocument(model, DOC, LIMITS);
    expect(out.ok).toBe(true);
    expect(seen.results[1]).toHaveLength(1);
    expect(seen.results[1]?.[0]).toMatchObject({ id: 'bad', name: 'record_claims' });
    const error = seen.results[1]?.[0]?.response['error'];
    expect(typeof error === 'string' && error.includes('case_type')).toBe(true);
    expect(typeof error === 'string' && error.length <= 500).toBe(true);
  });

  it('skips the document after a second invalid answer (never guesses)', async () => {
    const { model, seen } = scripted([
      [record({})],
      [record({ organisations: 'many' })],
      [record(CLAIMS)],
    ]);
    expect(await extractDocument(model, DOC, LIMITS)).toEqual({
      ok: false,
      error: 'model did not return valid claims',
    });
    expect(seen.results).toHaveLength(2);
  });

  it('skips the document without a retry when record_claims is not called', async () => {
    const { model, seen } = scripted([[{ id: 'x', name: 'submit_review', args: CLAIMS }]]);
    expect(await extractDocument(model, DOC, LIMITS)).toMatchObject({ ok: false });
    expect(seen.results).toHaveLength(1);
  });

  it('reports a model failure as a short error instead of throwing', async () => {
    const cause = new Error(`quota ${'x'.repeat(400)}`);
    const { model } = scripted([], new ModelError('Gemini request failed', { cause }));
    const out = await extractDocument(model, DOC, LIMITS);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error.startsWith('Gemini request failed (cause: quota')).toBe(true);
    expect(!out.ok && out.error.length).toBe(300);
  });
});

/** The page bodies a run sent to the model, read back from the delimited user turn. */
async function sentPages(limits: ExtractionLimits): Promise<string[]> {
  const { model, seen } = scripted([[record(CLAIMS)]]);
  await extractDocument(model, DOC, limits);
  const body = seen.user.split('<<<DOCUMENT\n')[1]?.split('\nDOCUMENT>>>')[0] ?? '';
  return body
    .split(/--- page \d+ ---\n/)
    .slice(1)
    .map((p) => p.replace(/\n$/, ''));
}
