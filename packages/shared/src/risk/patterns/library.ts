import { z } from 'zod';
import {
  PATTERN_SCHEMA_VERSION,
  PATTERN_TEMPLATES,
  PatternSchema,
  Sha256HexSchema,
  type Pattern,
  type PatternDefinition,
} from './schema.js';

/**
 * Reading and checking a pattern library (docs/plans/PATTERN_CONTRACT.md, sections 4, 7 and 8).
 * `packages/shared` also runs in the browser, so nothing here imports Node's crypto: the functions
 * that need sha256 take it as a parameter and the jobs pass one built on `node:crypto`.
 */

/** A function that returns the lowercase hex sha256 of a string. */
export type Sha256Hex = (input: string) => string;

/**
 * JSON with object keys sorted at every level and no whitespace, so the same value always gives the
 * same text. `undefined` properties are left out; anything JSON cannot hold throws.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('canonicalJson: number is not finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: cannot serialise a ${typeof value}`);
}

/** `pat_` plus the first 16 hex of sha256 of the canonical definition: same definition, same id. */
export function patternIdOf(definition: PatternDefinition, sha256: Sha256Hex): string {
  return `pat_${sha256(canonicalJson(definition)).slice(0, 16)}`;
}

/** sha256 of the canonical JSON of the patterns array, in the order given. */
export function contentHashOf(patterns: readonly unknown[], sha256: Sha256Hex): string {
  return sha256(canonicalJson(patterns));
}

export class PatternLibraryError extends Error {
  constructor(
    readonly code: 'bad_envelope' | 'content_hash_mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'PatternLibraryError';
  }
}

export interface SkippedPattern {
  /** Position in the delivered `patterns` array. */
  readonly index: number;
  readonly pattern_id: string | null;
  readonly reason: 'invalid' | 'unknown_template';
  /** Short, never contains pattern text beyond the first failing path. */
  readonly detail: string;
}

export interface LoadedLibrary {
  readonly libraryVersion: number;
  readonly contentHash: string;
  /** Every delivered pattern that parsed, any status. Use `approvedPatterns` to score. */
  readonly patterns: readonly Pattern[];
  readonly skipped: readonly SkippedPattern[];
}

/**
 * A library that could not be used at all: a broken envelope, a content hash that does not match, or a
 * source that could not be read. It is a result, not an exception, so every consumer records the same
 * finding without a try/catch.
 */
export interface RefusedLibrary {
  /** A short, readable reason with no pattern text in it. */
  readonly refused: string;
}

export const isRefusedLibrary = (r: LoadedLibrary | RefusedLibrary): r is RefusedLibrary =>
  'refused' in r;

/**
 * The one way the scorer gets patterns: from code, from a file, or from Firestore. `load` resolves to a
 * refused result when the library as a whole is unusable; it rejects only for a bug, never for a bad
 * library.
 */
export interface PatternSource {
  load(): Promise<LoadedLibrary | RefusedLibrary>;
}

const EnvelopeSchema = z.object({
  schema_version: z.literal(PATTERN_SCHEMA_VERSION),
  library_version: z.number().int().min(0),
  content_hash: Sha256HexSchema,
  patterns: z.array(z.unknown()),
});

const ProbeSchema = z.object({
  pattern_id: z.string().optional(),
  definition: z.object({ template: z.string() }).optional(),
});

const detailOf = (error: z.ZodError): string => {
  const issue = error.issues[0];
  if (issue === undefined) return 'invalid';
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`.slice(0, 200);
};

/**
 * The consumer's lenient read. A broken envelope, or (when `sha256` is given) a content hash that
 * does not match the delivered patterns, refuses the whole library. A single bad pattern is skipped
 * and reported, never fatal: an invalid one, one with a template this reader does not know (forward
 * compatibility), a repeated pattern_id, or (with `sha256`) an id that does not match its definition.
 */
export function parsePatternLibrary(raw: unknown, sha256?: Sha256Hex): LoadedLibrary {
  const envelope = EnvelopeSchema.safeParse(raw);
  if (!envelope.success)
    throw new PatternLibraryError(
      'bad_envelope',
      `not a pattern library: ${detailOf(envelope.error)}`,
    );
  const { library_version, content_hash, patterns } = envelope.data;
  if (sha256 !== undefined && contentHashOf(patterns, sha256) !== content_hash)
    throw new PatternLibraryError(
      'content_hash_mismatch',
      'the library content does not match its content_hash',
    );
  const ok: Pattern[] = [];
  const skipped: SkippedPattern[] = [];
  const seen = new Set<string>();
  patterns.forEach((item, index) => {
    const probe = ProbeSchema.safeParse(item);
    const id = probe.success ? (probe.data.pattern_id ?? null) : null;
    const template = probe.success ? probe.data.definition?.template : undefined;
    if (template !== undefined && !PATTERN_TEMPLATES.some((t) => t === template)) {
      skipped.push({
        index,
        pattern_id: id,
        reason: 'unknown_template',
        detail: template.slice(0, 40),
      });
      return;
    }
    const parsed = PatternSchema.safeParse(item);
    if (!parsed.success) {
      skipped.push({ index, pattern_id: id, reason: 'invalid', detail: detailOf(parsed.error) });
      return;
    }
    const pattern = parsed.data;
    const problem = seen.has(pattern.pattern_id)
      ? 'duplicate pattern_id'
      : sha256 !== undefined && patternIdOf(pattern.definition, sha256) !== pattern.pattern_id
        ? 'pattern_id does not match the definition'
        : null;
    if (problem !== null) {
      skipped.push({ index, pattern_id: pattern.pattern_id, reason: 'invalid', detail: problem });
      return;
    }
    seen.add(pattern.pattern_id);
    ok.push(pattern);
  });
  return { libraryVersion: library_version, contentHash: content_hash, patterns: ok, skipped };
}

/**
 * `parsePatternLibrary` for a source: the same read, but a refused library is returned as a
 * `RefusedLibrary` instead of thrown. Anything that is not a `PatternLibraryError` is a bug and still throws.
 */
export function readPatternLibrary(
  raw: unknown,
  sha256?: Sha256Hex,
): LoadedLibrary | RefusedLibrary {
  try {
    return parsePatternLibrary(raw, sha256);
  } catch (e: unknown) {
    if (e instanceof PatternLibraryError) return { refused: e.message.slice(0, 200) };
    throw e;
  }
}

/** The patterns the scorer may use: approved only (retired and draft are ignored). */
export const approvedPatterns = (lib: Pick<LoadedLibrary, 'patterns'>): Pattern[] =>
  lib.patterns.filter((p) => p.status === 'approved');

/**
 * The producer's seal: builds the envelope for a set of patterns, sorted by pattern_id, with the
 * content hash filled in. Used by the jobs and by the fixture generator.
 */
export function sealLibrary(
  libraryVersion: number,
  patterns: readonly Pattern[],
  sha256: Sha256Hex,
): { schema_version: 1; library_version: number; content_hash: string; patterns: Pattern[] } {
  const sorted = [...patterns].sort((a, b) =>
    a.pattern_id < b.pattern_id ? -1 : a.pattern_id > b.pattern_id ? 1 : 0,
  );
  return {
    schema_version: PATTERN_SCHEMA_VERSION,
    library_version: libraryVersion,
    content_hash: contentHashOf(sorted, sha256),
    patterns: sorted,
  };
}
