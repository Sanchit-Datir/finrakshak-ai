import { describe, expect, it } from 'vitest';
import {
  SynthGuardError,
  assertNoRealIdentifiers,
  assertSafeOutputDir,
  assertSynthDataset,
  findRealLookingIdentifiers,
} from './guards.js';

const ROOT = '/work/finrakshak-ai';

describe('assertSafeOutputDir (SESSION_NOTES: never change real data)', () => {
  it('refuses the three real data folders and anything inside them', () => {
    for (const dir of [
      'data/raw',
      'data/raw/mca_ogd',
      'data/processed',
      'data/processed/bigquery',
      'data/registry',
      '/work/finrakshak-ai/data/raw/ed',
      'data/synthetic/../raw',
      './data//processed/',
    ])
      expect(() => assertSafeOutputDir(dir, ROOT), dir).toThrow(SynthGuardError);
  });

  it('allows the synthetic folder and folders elsewhere, and returns the resolved path', () => {
    expect(assertSafeOutputDir('data/synthetic', ROOT)).toBe('/work/finrakshak-ai/data/synthetic');
    expect(assertSafeOutputDir('/tmp/synth-run', ROOT)).toBe('/tmp/synth-run');
    expect(assertSafeOutputDir('data/rawish', ROOT)).toBe('/work/finrakshak-ai/data/rawish');
    expect(assertSafeOutputDir('data/graph', ROOT)).toBe('/work/finrakshak-ai/data/graph');
  });
});

describe('assertSynthDataset (B-54)', () => {
  it('accepts names that end in _synth', () => {
    expect(assertSynthDataset('fundtrace_synth')).toBe('fundtrace_synth');
    expect(assertSynthDataset('bank_loans_synth')).toBe('bank_loans_synth');
  });

  it('refuses real-looking or malformed dataset names', () => {
    for (const name of [
      'fundtrace',
      'synth',
      '_synth',
      'fundtrace_synth_old',
      'Fundtrace_synth',
      'fund-trace_synth',
      'fundtrace synth',
      '',
    ])
      expect(() => assertSynthDataset(name), name).toThrow(SynthGuardError);
  });
});

describe('real-looking identifiers (B-37, B-38)', () => {
  it('finds each kind of identifier', () => {
    expect(findRealLookingIdentifiers('PAN ABCDE1234F here')).toEqual(['PAN']);
    expect(findRealLookingIdentifiers('cin U27100MH1995PTC000001')).toContain('CIN');
    expect(findRealLookingIdentifiers('ifsc SBIN0001234')).toEqual(['IFSC']);
    expect(findRealLookingIdentifiers('id 123456789012')).toEqual(['12-digit number']);
    expect(findRealLookingIdentifiers('mail a.b@example.com')).toEqual(['email address']);
    expect(findRealLookingIdentifiers('see https://www.sebi.gov.in/x')).toEqual([
      'URL outside example.invalid',
    ]);
  });

  it('passes synthetic text and example.invalid links', () => {
    for (const text of [
      'SYNTH Borrower One',
      'SYNTH-REF-T00001',
      'https://example.invalid/synthetic/doc_1',
      'https://a.b.example.invalid/x',
      '{"amountMinor":10000000,"at":"2024-01-01T00:00:00.000Z"}',
    ])
      expect(findRealLookingIdentifiers(text), text).toEqual([]);
  });

  it('assertNoRealIdentifiers throws on the first offending line', () => {
    expect(() => {
      assertNoRealIdentifiers(['fine', 'PAN ABCDE1234F']);
    }).toThrow(/PAN/);
    expect(() => {
      assertNoRealIdentifiers(['fine', 'SYNTH ok']);
    }).not.toThrow();
    expect(() => {
      assertNoRealIdentifiers([]);
    }).not.toThrow();
  });
});
