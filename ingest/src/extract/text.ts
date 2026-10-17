import * as cheerio from 'cheerio';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';
import { cleanText } from '../util/ids.js';

export const ExtractedTextSchema = z.object({
  sha256: z.string(),
  method: z.enum(['pdfjs', 'html']),
  pages: z.array(z.string()),
  chars: z.number().int().nonnegative(),
  needs_ocr: z.boolean(),
});
export type ExtractedText = z.infer<typeof ExtractedTextSchema>;

const MAX_PAGES = 400;

/** pdf.js yields TextItem | TextMarkedContent; only TextItem carries `str`. */
function pageString(items: readonly object[]): string {
  let out = '';
  for (const item of items) {
    if (!('str' in item) || typeof item.str !== 'string') continue;
    out += item.str;
    out += 'hasEOL' in item && item.hasEOL === true ? '\n' : ' ';
  }
  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** Text per page via pdf.js. Scanned (image-only) PDFs come back nearly empty → needs_ocr. */
export async function pdfToPages(data: Buffer): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(data), disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(pageString(content.items));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

const CONTENT_SELECTORS = [
  'table.tablebg',
  '.press-release',
  'article',
  'main',
  '#content',
  'body',
];

/** Main readable text of an HTML page (scripts, styles and navigation removed). */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, iframe').remove();
  for (const sel of CONTENT_SELECTORS) {
    const text = $(sel)
      .map((_, el) => $(el).text())
      .get()
      .join('\n');
    if (cleanText(text).length > 200)
      return text
        .replace(/[ \t\r]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();
  }
  return cleanText($.root().text());
}

export function needsOcr(pages: readonly string[]): boolean {
  const chars = pages.reduce((n, p) => n + p.length, 0);
  return pages.length > 0 && chars / pages.length < 80;
}
