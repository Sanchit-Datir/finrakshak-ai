import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FsBlobStore } from '../../storage/fsBlobStore.js';
import { ABSENT } from '../../storage/index.js';
import { readJsonl } from '../../store/jsonl.js';
import { claimRow, extractionRecord, SHA, shaOf } from '../../test/aiFixtures.js';
import { freshFsStore, useTempDataDir } from '../../test/tempData.js';
import { AiClaimRowSchema } from './schema.js';
import {
  allExtractions,
  claimsKey,
  extractedChecksums,
  saveExtraction,
  shadowTableKey,
  writeShadowTable,
} from './store.js';

useTempDataDir();
let store: FsBlobStore;

beforeEach(() => {
  store = freshFsStore();
});

describe('AI claims store (B-52)', () => {
  it('keys one object per prompt version, model and checksum, with safe path segments', () => {
    expect(claimsKey('extract.v1', 'gemini-3.1-flash-lite', SHA)).toBe(
      `interim/ai/claims/extract.v1/gemini-3.1-flash-lite/ab/${SHA}.json`,
    );
    expect(claimsKey('extract.v1', 'publishers/google/models/gemini 3', SHA)).toBe(
      `interim/ai/claims/extract.v1/publishers_google_models_gemini_3/ab/${SHA}.json`,
    );
    expect(() => claimsKey('extract.v1', '..', SHA)).toThrow(/Invalid storage key/);
  });

  it('writes create-only: a second write of the same claim does not overwrite it', async () => {
    const write = vi.spyOn(store, 'write');
    await saveExtraction(extractionRecord({ summary: 'first' }));
    await expect(saveExtraction(extractionRecord({ summary: 'second' }))).resolves.toBeUndefined();
    expect(write.mock.calls.map((c) => c[2]?.condition)).toEqual([ABSENT, ABSENT]);
    expect((await allExtractions()).map((r) => r.summary)).toEqual(['first']);
  });

  it('keeps a new prompt version or model in its own object, and lists checksums per pair', async () => {
    await saveExtraction(extractionRecord());
    await saveExtraction(extractionRecord({ sha256: shaOf(1), summary: 'other doc' }));
    await saveExtraction(extractionRecord({ model: 'gemini-other' }));
    await saveExtraction(extractionRecord({ prompt_version: 'extract.v2' }));
    expect(await allExtractions()).toHaveLength(4);
    expect(await extractedChecksums('extract.v1', 'gemini-test')).toEqual(new Set([SHA, shaOf(1)]));
    expect(await extractedChecksums('extract.v2', 'gemini-test')).toEqual(new Set([SHA]));
    expect(await extractedChecksums('extract.v1', 'gemini-other')).toEqual(new Set([SHA]));
    expect(await extractedChecksums('extract.v1', 'never-run')).toEqual(new Set());
  });

  it('ignores files that are not stored extractions', async () => {
    await saveExtraction(extractionRecord());
    await store.write('interim/ai/claims/extract.v1/gemini-test/ab/notes.txt', 'x');
    expect(await extractedChecksums('extract.v1', 'gemini-test')).toEqual(new Set([SHA]));
    expect(await allExtractions()).toHaveLength(1);
  });

  it('validates before writing: fractional money is rejected and nothing is stored (B-01)', async () => {
    const bad = extractionRecord({
      rows: [claimRow({ kind: 'amount', amount: { minor: 1.5, currency: 'INR' } })],
    });
    await expect(saveExtraction(bad)).rejects.toThrow();
    expect(await store.list('interim/ai/claims')).toEqual([]);
  });

  it('propagates storage failures other than an existing object', async () => {
    vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('disk full'));
    await expect(saveExtraction(extractionRecord())).rejects.toThrow('disk full');
  });

  it('refuses a corrupt stored object instead of skipping it', async () => {
    await store.write(claimsKey('extract.v1', 'gemini-test', SHA), '{"sha256": 1}');
    await expect(allExtractions()).rejects.toThrow(/Invalid JSON/);
  });

  it('flattens every stored extraction into the shadow table', async () => {
    const org = claimRow({
      kind: 'organisation',
      claim_id: 'aic_org',
      name: 'Example Finance Limited',
    });
    await saveExtraction(extractionRecord({ rows: [org] }));
    await saveExtraction(
      extractionRecord({
        sha256: shaOf(1),
        rows: [claimRow({ kind: 'case_type', sha256: shaOf(1), about: 'attachment' })],
      }),
    );
    const rows = await writeShadowTable();
    expect(rows.map((r) => r.kind).sort()).toEqual(['case_type', 'organisation']);
    expect(shadowTableKey).toBe('processed/ai_claims_shadow.jsonl');
    expect(await readJsonl(shadowTableKey, AiClaimRowSchema)).toEqual(rows);
  });
});
