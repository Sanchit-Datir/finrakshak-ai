import * as cheerio from 'cheerio';

export interface PageStructure {
  readonly title: string;
  readonly tables: number;
  readonly table_rows: number;
  /** First header row of each table (what the adapters key their columns on). */
  readonly table_headers: string[][];
  readonly links: number;
  readonly pdf_links: number;
  readonly forms: number;
  /** Visible text, collapsed and truncated (scripts and styles removed). */
  readonly text: string;
}

const MAX_TEXT = 12_000;
const MAX_TABLES = 5;

/**
 * Reduces a page to what explains a parsing failure: its structure and visible text. Pure code,
 * so the model gets a small, script-free view instead of raw HTML.
 */
export function describePage(html: string): PageStructure {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  const headers: string[][] = [];
  $('table')
    .slice(0, MAX_TABLES)
    .each((_, t) => {
      const cells = $(t).find('tr').first().find('th,td');
      headers.push(
        cells.toArray().map((c) => $(c).text().replace(/\s+/g, ' ').trim().slice(0, 60)),
      );
    });
  return {
    title: $('title').first().text().trim().slice(0, 200),
    tables: $('table').length,
    table_rows: $('table tr').length,
    table_headers: headers,
    links: $('a[href]').length,
    pdf_links: $('a[href$=".pdf"], a[href$=".PDF"]').length,
    forms: $('form').length,
    text: $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT),
  };
}
