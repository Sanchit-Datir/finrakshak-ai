import type { ListingItem } from '@finrakshak-ai/shared';
import { listS3waasCategory, type S3waasCategory } from './s3waas.js';
import type { SourceAdapter, SourceContext } from './types.js';

const CATEGORIES: readonly S3waasCategory[] = [
  { collection: 'sfio.prosecution', url: 'https://sfio.gov.in/document-category/prosecution/' },
  { collection: 'sfio.whats_new', url: 'https://sfio.gov.in/notice-category/whats-new/' },
  { collection: 'sfio.notifications', url: 'https://sfio.gov.in/notice-category/notifications/' },
];

export const sfioAdapter: SourceAdapter = {
  id: 'sfio',
  termsNote:
    'sfio.gov.in copyright policy: reproduction requires permission (email SFIO) and prominent attribution; internal research retention only until permission is obtained.',
  async list(ctx: SourceContext): Promise<ListingItem[]> {
    const all: ListingItem[] = [];
    for (const category of CATEGORIES)
      all.push(...(await listS3waasCategory('sfio', category, ctx)));
    return all;
  },
  resolveDocuments(item: ListingItem): Promise<string[]> {
    return Promise.resolve(item.document_urls);
  },
};
