import { describe, expect, it } from 'vitest';
import { findRealLookingIdentifiers } from './guards.js';
import { NameBook, counterpartyName } from './names.js';
import { createRng } from './rng.js';

describe('NameBook', () => {
  it('gives unique names that all start with SYNTH, also past the end of the pool', () => {
    const book = new NameBook(createRng(1));
    const names = Array.from({ length: 3_000 }, () => book.borrower());
    expect(new Set(names).size).toBe(3_000);
    expect(names.every((n) => n.startsWith('SYNTH '))).toBe(true);
  });

  it('numbers a name only when the pool has been used up', () => {
    const book = new NameBook(createRng(1));
    const names = Array.from({ length: 961 }, () => book.borrower());
    expect(names.slice(0, 960).some((n) => /\s\d+$/.test(n))).toBe(false);
    expect(names[960]).toMatch(/ 2$/);
  });

  it('is repeatable for a seed and different for another', () => {
    const first = (seed: number): string[] => {
      const b = new NameBook(createRng(seed));
      return [b.borrower(), b.borrower(), b.borrower()];
    };
    expect(first(5)).toEqual(first(5));
    expect(first(5)).not.toEqual(first(6));
  });

  it('never looks like a real identifier', () => {
    const book = new NameBook(createRng(2));
    for (let i = 0; i < 200; i++) expect(findRealLookingIdentifiers(book.borrower())).toEqual([]);
    expect(findRealLookingIdentifiers(counterpartyName('0007', 'S1'))).toEqual([]);
  });
});

describe('counterpartyName', () => {
  it('names the role and carries the loan number so it is unique', () => {
    expect(counterpartyName('0007', 'S1')).toBe('SYNTH Supplier 0007-S1');
    expect(counterpartyName('0007', 'C2')).toBe('SYNTH Customer 0007-C2');
    expect(counterpartyName('0007', 'R1')).toBe('SYNTH Related party 0007-R1');
  });
});
