import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PatternLibraryError,
  approvedPatterns,
  canonicalJson,
  contentHashOf,
  isRefusedLibrary,
  parsePatternLibrary,
  readPatternLibrary,
  patternIdOf,
  sealLibrary,
} from './library.js';
import { PatternLibrarySchema } from './schema.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const raw: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/library.sample.json', import.meta.url), 'utf8'),
);
const library = PatternLibrarySchema.parse(raw);

/** A raw envelope around raw pattern objects, with a correct content hash (so skips can be tested). */
const envelope = (patterns: unknown[]): unknown => ({
  schema_version: 1,
  library_version: 3,
  content_hash: contentHashOf(patterns, sha),
  patterns,
});
const clone = (i: number): Record<string, unknown> => {
  const p: unknown = structuredClone(library.patterns[i]);
  if (typeof p !== 'object' || p === null) throw new Error('fixture pattern missing');
  return { ...p };
};

describe('canonicalJson', () => {
  it('sorts keys at every level and ignores the order they were written in', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
  it('keeps array order, leaves out undefined properties and escapes strings', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson('a"b\n')).toBe('"a\\"b\\n"');
    expect(canonicalJson(null)).toBe('null');
  });
  it('refuses what JSON cannot hold', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(RangeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
    expect(() => canonicalJson(10n)).toThrow(TypeError);
  });
});

describe('ids and hashes', () => {
  it('gives every fixture pattern the id of its definition', () => {
    for (const p of library.patterns) expect(patternIdOf(p.definition, sha)).toBe(p.pattern_id);
  });
  it('gives the same id however the definition keys were written, and a new id when it changes', () => {
    const first = library.patterns[0];
    if (first === undefined) throw new Error('empty fixture');
    const d = first.definition;
    if (d.template !== 'sequence') throw new Error('expected a sequence first');
    const shuffled = {
      min_lead_months: d.min_lead_months,
      template: d.template,
      max_gap_months: d.max_gap_months,
      steps: d.steps,
    };
    expect(patternIdOf(shuffled, sha)).toBe(patternIdOf(d, sha));
    expect(patternIdOf({ ...d, max_gap_months: d.max_gap_months + 1 }, sha)).not.toBe(
      patternIdOf(d, sha),
    );
  });
  it('seals a library: sorted, hashed, valid, and the fixture is exactly that', () => {
    const sealed = sealLibrary(library.library_version, [...library.patterns].reverse(), sha);
    expect(sealed.content_hash).toBe(library.content_hash);
    expect(PatternLibrarySchema.safeParse(sealed).success).toBe(true);
    expect(sealed.patterns.map((p) => p.pattern_id)).toEqual(
      library.patterns.map((p) => p.pattern_id),
    );
  });
  it('depends on the order of the patterns', () => {
    expect(contentHashOf([...library.patterns].reverse(), sha)).not.toBe(library.content_hash);
  });
});

describe('parsePatternLibrary', () => {
  it('reads the fixture with the hash and ids verified, and nothing skipped', () => {
    const loaded = parsePatternLibrary(raw, sha);
    expect(loaded.skipped).toEqual([]);
    expect(loaded.patterns).toHaveLength(5);
    expect(loaded.libraryVersion).toBe(7);
    expect(loaded.contentHash).toBe(library.content_hash);
  });

  it('uses approved patterns only: retired are kept for history but not scored', () => {
    const loaded = parsePatternLibrary(raw, sha);
    expect(approvedPatterns(loaded)).toHaveLength(4);
    expect(loaded.patterns.some((p) => p.status === 'retired')).toBe(true);
  });

  it('refuses a library whose content does not match its hash', () => {
    const tampered = structuredClone(raw) as { patterns: { name: string }[] };
    const first = tampered.patterns[0];
    if (first === undefined) throw new Error('empty fixture');
    first.name = 'A different name';
    expect(() => parsePatternLibrary(tampered, sha)).toThrow(
      expect.objectContaining({ code: 'content_hash_mismatch' }),
    );
  });

  it.each<[string, unknown]>([
    ['not an object', 'text'],
    ['null', null],
    [
      'schema_version 2',
      { schema_version: 2, library_version: 1, content_hash: 'a'.repeat(64), patterns: [] },
    ],
    ['no patterns array', { schema_version: 1, library_version: 1, content_hash: 'a'.repeat(64) }],
    [
      'a hash of the wrong shape',
      { schema_version: 1, library_version: 1, content_hash: 'xyz', patterns: [] },
    ],
    [
      'a negative library_version',
      { schema_version: 1, library_version: -1, content_hash: 'a'.repeat(64), patterns: [] },
    ],
  ])('refuses a broken envelope: %s', (_label, input) => {
    expect(() => parsePatternLibrary(input)).toThrow(PatternLibraryError);
    expect(() => parsePatternLibrary(input)).toThrow(
      expect.objectContaining({ code: 'bad_envelope' }),
    );
  });

  it('skips one invalid pattern, reports it, and keeps the others', () => {
    const bad = clone(0);
    bad['name'] = 'Fraud before insolvency';
    const good = clone(1);
    const loaded = parsePatternLibrary(envelope([bad, good]), sha);
    expect(loaded.patterns.map((p) => p.pattern_id)).toEqual([good['pattern_id']]);
    expect(loaded.skipped).toHaveLength(1);
    expect(loaded.skipped[0]).toMatchObject({
      index: 0,
      reason: 'invalid',
      pattern_id: bad['pattern_id'],
    });
    expect(loaded.skipped[0]?.detail.length).toBeLessThanOrEqual(200);
  });

  it('skips a template it does not know instead of failing (forward compatibility)', () => {
    const future = clone(0);
    future['definition'] = { template: 'time_decay', half_life_months: 6 };
    const loaded = parsePatternLibrary(envelope([future, clone(1)]), sha);
    expect(loaded.skipped).toEqual([
      {
        index: 0,
        pattern_id: future['pattern_id'],
        reason: 'unknown_template',
        detail: 'time_decay',
      },
    ]);
    expect(loaded.patterns).toHaveLength(1);
  });

  it('skips junk items without throwing', () => {
    const loaded = parsePatternLibrary(envelope([null, 'x', 7, [], {}, clone(0)]), sha);
    expect(loaded.patterns).toHaveLength(1);
    expect(loaded.skipped.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(loaded.skipped.every((s) => s.reason === 'invalid')).toBe(true);
  });

  it('skips a repeated pattern_id and an id that does not match the definition', () => {
    const a = clone(0);
    const mismatched = clone(1);
    mismatched['pattern_id'] = 'pat_0000000000000000';
    const loaded = parsePatternLibrary(envelope([a, structuredClone(a), mismatched]), sha);
    expect(loaded.patterns).toHaveLength(1);
    expect(loaded.skipped.map((s) => s.detail)).toEqual([
      'duplicate pattern_id',
      'pattern_id does not match the definition',
    ]);
  });

  it('can be read without a hash function (id and hash checks are then left to the caller)', () => {
    const loaded = parsePatternLibrary(raw);
    expect(loaded.patterns).toHaveLength(5);
  });

  it('treats an empty library as valid but with nothing to score', () => {
    const loaded = parsePatternLibrary(envelope([]), sha);
    expect(loaded.patterns).toEqual([]);
    expect(approvedPatterns(loaded)).toEqual([]);
  });
});

describe('readPatternLibrary', () => {
  it('returns the same library as parsePatternLibrary when it is usable', () => {
    expect(readPatternLibrary(raw, sha)).toEqual(parsePatternLibrary(raw, sha));
  });

  it('returns a refused result, without throwing, for a broken envelope', () => {
    const r = readPatternLibrary({ library_version: 1 });
    expect(isRefusedLibrary(r) ? r.refused : '').toMatch(/^not a pattern library/);
  });

  it('returns a refused result for a content hash that does not match', () => {
    const r = readPatternLibrary({ ...library, content_hash: 'b'.repeat(64) }, sha);
    expect(isRefusedLibrary(r) ? r.refused : '').toMatch(/content_hash/);
  });

  it('still skips a single bad pattern instead of refusing the library', () => {
    const r = readPatternLibrary(envelope([null, clone(0)]), sha);
    expect(isRefusedLibrary(r)).toBe(false);
    if (!isRefusedLibrary(r)) expect(r.skipped).toHaveLength(1);
  });
});
