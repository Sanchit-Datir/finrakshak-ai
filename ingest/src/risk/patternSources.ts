import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  HAND_WRITTEN_LIBRARY,
  approvedPatterns,
  isRefusedLibrary,
  readPatternLibrary,
  type LoadedLibrary,
  type Pattern,
  type PatternLibrary,
  type PatternSource,
  type RunFinding,
} from '@finrakshak-ai/shared';

/**
 * Where the scorer gets its patterns (PATTERN_CONTRACT.md, sections 4 and 7): from code (the hand-written
 * version 1) or from a file (`minerCli export-library`, path in FINRAKSHAK_AI_PATTERN_LIBRARY). A Firestore
 * source follows in step 15. Every source goes through `readPatternLibrary` with a real sha256, so a
 * library whose content hash does not match is refused, and a bad pattern is skipped and reported. The
 * scorer only ever reads the library; it never writes or edits one.
 */

export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

export const codePatterns = (library: PatternLibrary = HAND_WRITTEN_LIBRARY): PatternSource => ({
  load: () => Promise.resolve(readPatternLibrary(library, sha256Hex)),
});

export const filePatterns = (file: string): PatternSource => ({
  load: async () => {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return { refused: 'the library file could not be read or is not JSON' };
    }
    return readPatternLibrary(raw, sha256Hex);
  },
});

export interface UsableLibrary {
  /** Null when the library was refused: the pattern layer then scores 0 with `no_patterns` (B-56). */
  readonly library: {
    readonly libraryVersion: number;
    readonly patterns: readonly Pattern[];
  } | null;
  readonly findings: readonly RunFinding[];
}

const skippedFindings = (lib: LoadedLibrary): RunFinding[] =>
  lib.skipped.map((s) => ({
    code: s.reason === 'unknown_template' ? 'unknown_template' : 'invalid_pattern',
    detail: `${s.pattern_id ?? `#${s.index}`}: ${s.detail}`.slice(0, 200),
  }));

/** Loads a source; a refused library becomes a `library_refused` finding, never a crash. */
export async function loadLibrary(source: PatternSource): Promise<UsableLibrary> {
  const lib = await source.load();
  if (isRefusedLibrary(lib))
    return { library: null, findings: [{ code: 'library_refused', detail: lib.refused }] };
  return {
    library: { libraryVersion: lib.libraryVersion, patterns: approvedPatterns(lib) },
    findings: skippedFindings(lib),
  };
}
