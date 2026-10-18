import type { ListingItem } from '@finrakshak-ai/shared';
import type { AiClaimRow, AiExtractionRecord } from '../extract/ai/schema.js';
import { RUN_AT } from './fixtures.js';

/** A valid 64-hex checksum per number (n = 0xab… gives a distinct two-character shard). */
export const shaOf = (n: number): string => n.toString(16).padStart(64, '0');
export const SHA = `ab${'0'.repeat(62)}`;
export const DOC_URL = 'https://enforcementdirectorate.gov.in/press/doc1.pdf';

/** An ED provisional-attachment press release: classify() makes its claims allegations (B-36). */
export function listingItem(over: Partial<ListingItem> = {}): ListingItem {
  return {
    item_id: 'ed_1',
    source_id: 'ed',
    collection: 'ed.press_releases',
    title: 'ED provisionally attaches assets of Example Finance Limited',
    detail_url: null,
    document_urls: [DOC_URL],
    published_date: '2026-10-01',
    fields: {},
    listed_at: RUN_AT,
    ...over,
  };
}

export function claimRow(over: Partial<AiClaimRow> & Pick<AiClaimRow, 'kind'>): AiClaimRow {
  return {
    claim_id: `aic_${over.kind}`,
    sha256: SHA,
    source_id: 'ed',
    item_id: 'ed_1',
    document_url: DOC_URL,
    name: null,
    cin: null,
    role: null,
    amount: null,
    amount_text: null,
    date: null,
    about: null,
    page: null,
    evidence_status: 'allegation',
    model: 'gemini-test',
    prompt_version: 'extract.v1',
    extracted_at: RUN_AT,
    ...over,
  };
}

export function extractionRecord(over: Partial<AiExtractionRecord> = {}): AiExtractionRecord {
  return {
    sha256: SHA,
    source_id: 'ed',
    item_id: 'ed_1',
    document_url: DOC_URL,
    model: 'gemini-test',
    prompt_version: 'extract.v1',
    extracted_at: RUN_AT,
    case_type: 'attachment',
    summary: 'ED provisionally attached assets.',
    rows: [claimRow({ kind: 'case_type', about: 'attachment' })],
    dropped: { ungrounded: 0, not_organisation: 0, unparsed_amount: 0 },
    ...over,
  };
}
