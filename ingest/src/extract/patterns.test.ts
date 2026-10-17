import { describe, expect, it } from 'vitest';
import { excerptAround, findAmounts, findCins, findCompanyNames, toInrMinor } from './patterns.js';

describe('findCins', () => {
  it('finds valid CINs and rejects bad state codes / years', () => {
    const text =
      'CIN: L65922MH1984PLC287696; bogus U12345ZZ1990PTC123456 and U12345MH3000PTC123456';
    expect(findCins(text).map((c) => c.cin)).toEqual(['L65922MH1984PLC287696']);
  });
  it('returns nothing for empty text', () => {
    expect(findCins('')).toEqual([]);
  });
});

describe('toInrMinor (B-01, B-03, B-05)', () => {
  it('converts crore/lakh decimals exactly to paise', () => {
    expect(toInrMinor('62.70', 'Crore')).toEqual({ minor: 62_700_000_000, currency: 'INR' });
    expect(toInrMinor('5', 'lakh')).toEqual({ minor: 50_000_000, currency: 'INR' });
    expect(toInrMinor('10,00,000')).toEqual({ minor: 100_000_000, currency: 'INR' });
  });
  it('rejects sub-paisa values instead of rounding', () => {
    expect(toInrMinor('1.234')).toBeNull();
  });
  it('rejects values beyond the safe-integer range', () => {
    expect(toInrMinor('99999999999', 'crore')).toBeNull();
  });
  it('rejects malformed numbers', () => {
    expect(toInrMinor('1.2.3')).toBeNull();
    expect(toInrMinor('')).toBeNull();
  });
});

describe('findAmounts', () => {
  it('reads common Indian formats', () => {
    const found = findAmounts('attached assets worth Rs. 62.70 Crore and a penalty of ₹5,00,000/-');
    expect(found.map((a) => a.money.minor)).toEqual([62_700_000_000, 50_000_000]);
  });
  it('ignores zero amounts', () => {
    expect(findAmounts('Rs. 0')).toEqual([]);
  });
});

describe('findCompanyNames', () => {
  it('extracts suffix-terminated names and strips leading noise', () => {
    const names = findCompanyNames(
      'Order in the matter of M/s. Religare Finvest Limited against CA X',
    );
    expect(names.map((n) => n.name)).toEqual(['Religare Finvest Limited']);
  });
  it('handles upper-case private companies', () => {
    expect(findCompanyNames('VATIKA IT PARKS PRIVATE LIMITED').map((n) => n.name)).toEqual([
      'VATIKA IT PARKS PRIVATE LIMITED',
    ]);
  });
  it('skips generic phrases', () => {
    expect(findCompanyNames('the Company Limited')).toEqual([]);
  });
});

describe('excerptAround', () => {
  it('clips and collapses whitespace', () => {
    expect(excerptAround('a\n\nb   c', 0, 10)).toBe('a b c');
  });
});
