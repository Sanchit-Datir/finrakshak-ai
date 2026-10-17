/** A small CSV reader and writer (RFC 4180 quoting) so the review sheet opens in Excel or Sheets. */

const BOM = '﻿';

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Rows to text, with a byte-order mark so Excel reads the UTF-8 correctly. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${BOM}${rows.map((r) => r.map(quote).join(',')).join('\n')}\n`;
}

/**
 * Text to rows. Handles quoted cells with commas, quotes and line breaks, CRLF or LF, a byte-order mark
 * and a missing final newline. A quote that never closes is an error.
 */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i);
    if (inQuotes) {
      if (ch === '"' && src.charAt(i + 1) === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src.charAt(i + 1) === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (inQuotes) throw new Error('CSV has a quoted cell that never closes');
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Spreadsheet programs run cells that start with = + - or @ as formulas. Text copied from the web
 * (titles, links) goes through this before it is written.
 */
export function neutraliseFormula(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}
