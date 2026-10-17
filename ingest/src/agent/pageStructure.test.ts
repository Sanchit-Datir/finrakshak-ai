import { describe, expect, it } from 'vitest';
import { describePage } from './pageStructure.js';

describe('describePage', () => {
  it('summarises tables, links and text, without scripts or styles', () => {
    const page = describePage(
      '<html><head><title> IBBI </title><style>.x{}</style></head><body><table><tr><th>Name of  Debtor</th><th>Date</th></tr><tr><td>A</td></tr></table><a href="/a.pdf">pdf</a><a href="/b">b</a><form></form><script>steal()</script></body></html>',
    );
    expect(page).toMatchObject({
      title: 'IBBI',
      tables: 1,
      table_rows: 2,
      table_headers: [['Name of Debtor', 'Date']],
      links: 2,
      pdf_links: 1,
      forms: 1,
    });
    expect(page.text).not.toContain('steal');
  });
  it('caps the text it returns', () => {
    expect(describePage(`<body>${'word '.repeat(10_000)}</body>`).text.length).toBe(12_000);
  });
});
