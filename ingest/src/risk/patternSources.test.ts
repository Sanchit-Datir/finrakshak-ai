import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  HAND_WRITTEN_LIBRARY,
  contentHashOf,
  sealLibrary,
  type PatternSource,
} from '@fund-tracker/shared';
import { codePatterns, filePatterns, loadLibrary, sha256Hex } from './patternSources.js';

const SAMPLE = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../../packages/shared/src/risk/patterns/fixtures/library.sample.json',
);
const tempFile = (content: unknown): string => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'fundtrace-lib-')), 'library.json');
  writeFileSync(file, JSON.stringify(content));
  return file;
};
const SampleSchema = z.object({ patterns: z.array(z.unknown()) }).passthrough();
const sample = (): z.infer<typeof SampleSchema> =>
  SampleSchema.parse(JSON.parse(readFileSync(SAMPLE, 'utf8')));

describe('pattern sources', () => {
  it('code: the hand-written library, all approved, version 1', async () => {
    const lib = await loadLibrary(codePatterns());
    expect(lib.findings).toEqual([]);
    expect(lib.library?.libraryVersion).toBe(1);
    expect(lib.library?.patterns).toHaveLength(HAND_WRITTEN_LIBRARY.patterns.length);
  });

  it('file: the shared sample library, approved patterns only (the retired one is dropped)', async () => {
    const lib = await loadLibrary(filePatterns(SAMPLE));
    expect(lib.findings).toEqual([]);
    expect(lib.library?.patterns.every((p) => p.status === 'approved')).toBe(true);
    expect(lib.library?.patterns).toHaveLength(sample().patterns.length - 1);
  });

  it('refuses a library whose content hash does not match, as a finding', async () => {
    const lib = await loadLibrary(
      filePatterns(tempFile({ ...sample(), content_hash: 'a'.repeat(64) })),
    );
    expect(lib.library).toBeNull();
    expect(lib.findings.map((f) => f.code)).toEqual(['library_refused']);
  });

  it('refuses an unreadable or non-JSON file as a finding, never crashing', async () => {
    const missing = await loadLibrary(filePatterns('/nonexistent/library.json'));
    expect(missing.library).toBeNull();
    expect(missing.findings.map((f) => f.code)).toEqual(['library_refused']);
    expect(missing.findings[0]?.detail).toMatch(/could not be read/);
    const notJson = path.join(mkdtempSync(path.join(tmpdir(), 'fundtrace-lib-')), 'library.json');
    writeFileSync(notJson, '{ not json');
    expect((await loadLibrary(filePatterns(notJson))).findings.map((f) => f.code)).toEqual([
      'library_refused',
    ]);
  });

  it("turns any source's refused result into a finding without a try/catch", async () => {
    const refusing: PatternSource = { load: () => Promise.resolve({ refused: 'down for now' }) };
    expect(await loadLibrary(refusing)).toEqual({
      library: null,
      findings: [{ code: 'library_refused', detail: 'down for now' }],
    });
  });

  it('skips an invalid pattern and an unknown template, counting each as a finding', async () => {
    const raw = sample();
    const bad = Object.assign({}, raw.patterns[0], { name: 'x' });
    const future = { pattern_id: 'pat_1111111111111111', definition: { template: 'velocity' } };
    const patterns = [...raw.patterns, bad, future];
    const file = tempFile({ ...raw, patterns, content_hash: contentHashOf(patterns, sha256Hex) });
    const lib = await loadLibrary(filePatterns(file));
    expect(lib.library?.patterns).toHaveLength(raw.patterns.length - 1);
    expect(lib.findings.map((f) => f.code).sort()).toEqual(['invalid_pattern', 'unknown_template']);
  });

  it('an empty library loads with no patterns', async () => {
    const lib = await loadLibrary(
      codePatterns({
        ...HAND_WRITTEN_LIBRARY,
        patterns: [],
        content_hash: sealLibrary(0, [], sha256Hex).content_hash,
      }),
    );
    expect(lib.library?.patterns).toEqual([]);
  });
});
