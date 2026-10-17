import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MONITORING_RULE_IDS } from '../rules/types.js';
import { HAND_WRITTEN_LIBRARY } from './handWritten.js';
import { parsePatternLibrary, patternIdOf } from './library.js';
import { PatternLibrarySchema } from './schema.js';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

describe('hand-written pattern library v1', () => {
  it('passes PatternLibrarySchema', () => {
    expect(PatternLibrarySchema.safeParse(HAND_WRITTEN_LIBRARY).success).toBe(true);
  });

  it('has real pattern ids and a content hash that the reader accepts', () => {
    for (const p of HAND_WRITTEN_LIBRARY.patterns)
      expect(patternIdOf(p.definition, sha256)).toBe(p.pattern_id);
    const loaded = parsePatternLibrary(HAND_WRITTEN_LIBRARY, sha256);
    expect(loaded.skipped).toEqual([]);
    expect(loaded.patterns).toHaveLength(HAND_WRITTEN_LIBRARY.patterns.length);
    expect(loaded.libraryVersion).toBe(1);
  });

  it('is approved, hand-written hypotheses only', () => {
    for (const p of HAND_WRITTEN_LIBRARY.patterns) {
      expect(p).toMatchObject({ status: 'approved', origin: 'hand_written' });
      expect(p.support).toMatchObject({
        basis: 'hand_written_hypothesis',
        supporting_case_count: 0,
      });
    }
  });

  it('covers each of the five monitoring rules once, plus public-record sequences', () => {
    const rules = HAND_WRITTEN_LIBRARY.patterns.flatMap((p) =>
      p.definition.template === 'transaction_typology' ? [p.definition.rule_id] : [],
    );
    expect([...rules].sort()).toEqual([...MONITORING_RULE_IDS].sort());
    const templates = new Set(HAND_WRITTEN_LIBRARY.patterns.map((p) => p.definition.template));
    expect(templates).toEqual(new Set(['transaction_typology', 'sequence', 'co_occurrence']));
  });
});
