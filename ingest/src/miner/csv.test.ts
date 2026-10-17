import { describe, expect, it } from 'vitest';
import { neutraliseFormula, parseCsv, toCsv } from './csv.js';

describe('toCsv and parseCsv', () => {
  it('round-trips plain, comma, quote, line-break and non-ASCII cells', () => {
    const rows = [
      ['a', 'b,c', 'say "hi"', 'two\nlines', '₹ 5 crore', ''],
      ['', '', '', '', '', 'last'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('writes a byte-order mark so Excel reads UTF-8, and parse accepts it', () => {
    expect(toCsv([['x']]).startsWith('﻿')).toBe(true);
    expect(parseCsv('﻿a,b\n')).toEqual([['a', 'b']]);
  });

  it('reads CRLF, LF and a missing final newline', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('keeps an empty last cell', () => {
    expect(parseCsv('a,\n')).toEqual([['a', '']]);
  });

  it('refuses a quote that never closes', () => {
    expect(() => parseCsv('a,"oops\nb')).toThrow(/never closes/);
  });
});

describe('neutraliseFormula', () => {
  it('prefixes cells a spreadsheet would run as a formula', () => {
    for (const cell of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '=HYPERLINK("http://x")'])
      expect(neutraliseFormula(cell), cell).toBe(`'${cell}`);
  });
  it('leaves ordinary text alone', () => {
    for (const cell of [
      'Public Announcement',
      'doc_1|ibbi_cirp|2024-01-02',
      '',
      'a=b',
      '2024-01-02',
    ])
      expect(neutraliseFormula(cell), cell).toBe(cell);
  });
});
