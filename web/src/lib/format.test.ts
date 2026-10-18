import { describe, expect, it } from 'vitest';
import { formatMoney, maskIdentifier, parseRupeesToMinor } from './format.js';
import { parseAreaToHectares } from './land.js';
import { normalizeDigits } from './text.js';

describe('money', () => {
  it('formats paise with Indian grouping', () => {
    expect(formatMoney(16_000_000)).toBe('₹1,60,000');
  });
  it('parses rupee input to integer paise and rejects bad input', () => {
    expect(parseRupeesToMinor('1,50,000.5')).toBe(15_000_050);
    expect(parseRupeesToMinor('12.345')).toBeNull();
    expect(parseRupeesToMinor('abc')).toBeNull();
    expect(parseRupeesToMinor('')).toBeNull();
  });
});

describe('masking', () => {
  it('shows only last four digits', () => {
    expect(maskIdentifier('1234 5678 9012')).toBe('XXXX XXXX 9012');
  });
});

describe('land and digits', () => {
  it('reads 7/12 hectare-are notation in Devanagari digits', () => {
    expect(parseAreaToHectares('१ हे ६२ आर', 'hectare')).toBeCloseTo(1.62);
  });
  it('converts acres explicitly', () => {
    expect(parseAreaToHectares('4', 'acre')).toBeCloseTo(1.6187, 3);
  });
  it('returns null when unparseable', () => {
    expect(parseAreaToHectares('२ हेक्टर', 'hectare')).toBeNull();
  });
  it('normalises Devanagari digits only for comparison', () => {
    expect(normalizeDigits('गट २१४/२')).toBe('गट 214/2');
  });
});
