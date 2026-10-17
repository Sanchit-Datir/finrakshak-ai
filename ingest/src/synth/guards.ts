import path from 'node:path';

/**
 * Guards that keep synthetic data away from real data (B-54). They throw `SynthGuardError`; none of
 * them touches the file system or the network.
 */

export class SynthGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SynthGuardError';
  }
}

/** Folders of real source data that the generator must never write into (SESSION_NOTES rule). */
export const PROTECTED_DATA_DIRS: readonly string[] = [
  'data/raw',
  'data/processed',
  'data/registry',
];

const isInside = (parent: string, child: string): boolean => {
  const rel = path.relative(parent, child);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * Resolves `outDir` against the repository root and refuses it when it is, or lies inside, a folder of
 * real data. Returns the resolved path.
 */
export function assertSafeOutputDir(outDir: string, repoRoot: string): string {
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, outDir);
  for (const dir of PROTECTED_DATA_DIRS)
    if (isInside(path.join(root, dir), target))
      throw new SynthGuardError(`Refusing to write synthetic data into ${dir}`);
  return target;
}

/** A BigQuery dataset for synthetic data must be named `<something>_synth`. */
export function assertSynthDataset(name: string): string {
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*_synth$/.test(name))
    throw new SynthGuardError(`Dataset "${name}" is not a synthetic dataset (must end in _synth)`);
  return name;
}

const REAL_LOOKING: readonly (readonly [string, RegExp])[] = [
  ['PAN', /\b[A-Z]{5}\d{4}[A-Z]\b/],
  ['CIN', /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/],
  ['IFSC', /\b[A-Z]{4}0[A-Z0-9]{6}\b/],
  ['12-digit number', /\b\d{12}\b/],
  ['email address', /[\w.+-]+@[\w-]+\.[\w.]+/],
  ['URL outside example.invalid', /https?:\/\/(?!(?:[\w-]+\.)*example\.invalid\b)[^\s"']+/],
];

/** The kinds of real-looking identifier found in `text` (empty when none). */
export function findRealLookingIdentifiers(text: string): string[] {
  return REAL_LOOKING.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}

/** Throws when any generated line looks like it holds a real identifier. */
export function assertNoRealIdentifiers(lines: Iterable<string>): void {
  for (const line of lines) {
    const found = findRealLookingIdentifiers(line);
    if (found.length > 0)
      throw new SynthGuardError(
        `Generated data looks like it contains a ${found[0] ?? 'real identifier'}`,
      );
  }
}
