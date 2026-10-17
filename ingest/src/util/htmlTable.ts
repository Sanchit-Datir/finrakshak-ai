import * as cheerio from 'cheerio';
import { absoluteUrl, cleanText } from './ids.js';

export interface TableRow {
  readonly cells: Readonly<Record<string, string>>;
  readonly links: readonly string[];
}

function headerKey(text: string, index: number): string {
  const key = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key.length > 0 ? key : `col_${index}`;
}

function linksFrom(attrs: readonly string[], base: string): string[] {
  const links: string[] = [];
  for (const attr of attrs) {
    const raw = /'\s*(https?:[^']+)'/.exec(attr)?.[1] ?? attr;
    const url = absoluteUrl(raw, base);
    if (url && !links.includes(url)) links.push(url);
  }
  return links;
}

/**
 * Parses every data row of the first table matching `selector`, keyed by the
 * snake_cased header text. Rows whose cell count differs from the header are kept
 * with positional keys so nothing is silently dropped.
 */
export function parseTable(html: string, base: string, selector = 'table'): TableRow[] {
  const $ = cheerio.load(html);
  const table = $(selector).first();
  const headers = table
    .find('tr')
    .first()
    .find('th,td')
    .map((i, el) => headerKey(cleanText($(el).text()), i))
    .get();
  const rows: TableRow[] = [];
  table
    .find('tr')
    .slice(1)
    .each((_, tr) => {
      const cells: Record<string, string> = {};
      $(tr)
        .find('td')
        .each((i, td) => {
          cells[headers[i] ?? `col_${i}`] = cleanText($(td).text());
        });
      const attrs = $(tr)
        .find('a')
        .map((_, a) => [$(a).attr('href') ?? '', $(a).attr('onclick') ?? ''])
        .get();
      if (Object.keys(cells).length > 0) rows.push({ cells, links: linksFrom(attrs, base) });
    });
  return rows;
}
