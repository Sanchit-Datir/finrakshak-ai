import { describe, expect, it } from 'vitest';
import {
  guessEntityType,
  looksLikeOrganisation,
  nameSimilarity,
  normalizeCompanyName,
  normalizePersonName,
} from './names.js';

describe('normalizeCompanyName', () => {
  it('unifies legal-form variants and prefixes', () => {
    expect(normalizeCompanyName('M/s. ABC Pvt. Ltd.')).toBe('ABC PRIVATE LIMITED');
    expect(normalizeCompanyName('ABC PRIVATE LIMITED')).toBe('ABC PRIVATE LIMITED');
    expect(normalizeCompanyName('The A & B Co. Ltd')).toBe('A AND B COMPANY LIMITED');
  });
  it('drops insolvency status tails', () => {
    expect(normalizeCompanyName('XYZ Limited (In Liquidation)')).toBe('XYZ LIMITED');
  });
  it('normalises unicode (B-26)', () => {
    expect(normalizeCompanyName('ＡＢＣ Ltd')).toBe('ABC LIMITED');
  });
});

describe('normalizePersonName', () => {
  it('removes honorifics and punctuation', () => {
    expect(normalizePersonName('Mr. CA  A.K. Sharma')).toBe('A K SHARMA');
  });
});

describe('guessEntityType', () => {
  it('classifies common forms', () => {
    expect(guessEntityType('PUNJAB NATIONAL BANK')).toBe('bank');
    expect(guessEntityType('BSR AND CO LLP')).toBe('audit_firm');
    expect(guessEntityType('ACME LLP')).toBe('llp');
    expect(guessEntityType('ACME LIMITED')).toBe('company');
  });
});

describe('looksLikeOrganisation / nameSimilarity', () => {
  it('detects organisations', () => {
    expect(looksLikeOrganisation('State Bank of India')).toBe(true);
    expect(looksLikeOrganisation('Ramesh Kumar')).toBe(false);
  });
  it('scores token overlap ignoring legal suffixes', () => {
    expect(nameSimilarity('ABC STEEL LIMITED', 'ABC STEEL PRIVATE LIMITED')).toBe(1);
    expect(nameSimilarity('ABC STEEL LIMITED', 'XYZ POWER LIMITED')).toBe(0);
    expect(nameSimilarity('LIMITED', 'LIMITED')).toBe(0);
  });
});
