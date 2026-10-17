import type { ListingItem } from '@fund-tracker/shared';
import { listS3waasCategory, type S3waasCategory } from './s3waas.js';
import type { SourceAdapter, SourceContext } from './types.js';

const BASE = 'https://nfra.gov.in/document-category';

const CATEGORIES: readonly S3waasCategory[] = [
  { collection: 'nfra.orders', url: `${BASE}/orders/` },
  { collection: 'nfra.aqr_reports', url: `${BASE}/audit-quality-review-aqr-report/` },
  {
    collection: 'nfra.frqr_reports',
    url: `${BASE}/financial-reporting-quality-review-frqr-report/`,
  },
  { collection: 'nfra.inspection_reports', url: `${BASE}/inspection-reports/` },
];

export const nfraAdapter: SourceAdapter = {
  id: 'nfra',
  termsNote:
    'nfra.gov.in public document; robots.txt permits crawling outside /wp-admin/. Reuse terms not published on site — attribute NFRA and verify before redistribution.',
  async list(ctx: SourceContext): Promise<ListingItem[]> {
    const all: ListingItem[] = [];
    for (const category of CATEGORIES)
      all.push(...(await listS3waasCategory('nfra', category, ctx)));
    return all;
  },
  resolveDocuments(item: ListingItem): Promise<string[]> {
    return Promise.resolve(item.document_urls);
  },
};
