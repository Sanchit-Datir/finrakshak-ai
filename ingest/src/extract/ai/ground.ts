import type { ListingItem } from '@fund-tracker/shared';
import { classify } from '../../dataset/classify.js';
import { looksLikeOrganisation } from '../../resolve/names.js';
import { stableId } from '../../util/ids.js';
import { findAmounts, findCins } from '../patterns.js';
import type { AiClaimRow, AiExtractionRecord, ModelExtraction } from './schema.js';

export interface GroundingInput {
  readonly sha256: string;
  readonly item: ListingItem;
  readonly url: string;
  /** The full document text (not just what the model saw), for grounding. */
  readonly pages: readonly string[];
  readonly model: string;
  readonly promptVersion: string;
  readonly extractedAt: string;
}

type Dropped = AiExtractionRecord['dropped'];
type RowFactory = (
  kind: AiClaimRow['kind'],
  key: string,
  fields: Partial<AiClaimRow>,
) => AiClaimRow;

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

function rowFactory(input: GroundingInput): RowFactory {
  const base = {
    sha256: input.sha256,
    source_id: input.item.source_id,
    item_id: input.item.item_id,
    document_url: input.url,
    // Evidence status by code from the source's classification, never by the model (B-36).
    evidence_status: classify(input.item).evidence_status,
    model: input.model,
    prompt_version: input.promptVersion,
    extracted_at: input.extractedAt,
    name: null,
    cin: null,
    role: null,
    amount: null,
    amount_text: null,
    date: null,
    about: null,
    page: null,
  };
  return (kind, key, fields) => ({
    ...base,
    ...fields,
    kind,
    claim_id: stableId('aic', input.sha256, input.promptVersion, kind, key),
  });
}

function organisations(
  out: ModelExtraction,
  text: string,
  cins: ReadonlySet<string>,
  make: RowFactory,
  dropped: Dropped,
): AiClaimRow[] {
  const rows: AiClaimRow[] = [];
  for (const o of out.organisations) {
    // Individuals are never extracted (B-38); only names printed in the document are kept.
    if (!looksLikeOrganisation(o.name)) dropped.not_organisation++;
    else if (!text.includes(norm(o.name))) dropped.ungrounded++;
    else {
      const cin = o.cin !== null && cins.has(o.cin) ? o.cin : null;
      if (o.cin !== null && cin === null) dropped.ungrounded++;
      rows.push(
        make('organisation', norm(o.name), { name: o.name, cin, role: o.role, page: o.page }),
      );
    }
  }
  return rows;
}

function amounts(
  out: ModelExtraction,
  text: string,
  make: RowFactory,
  dropped: Dropped,
): AiClaimRow[] {
  const rows: AiClaimRow[] = [];
  for (const a of out.amounts) {
    // The printed text is converted to integer paise by code (B-01); the model never does arithmetic.
    const money = findAmounts(a.amount_text)[0]?.money ?? null;
    if (!text.includes(norm(a.amount_text))) dropped.ungrounded++;
    else if (money === null) dropped.unparsed_amount++;
    else
      rows.push(
        make('amount', `${a.amount_text}|${String(a.page)}`, {
          amount: money,
          amount_text: a.amount_text,
          about: a.about,
          page: a.page,
        }),
      );
  }
  return rows;
}

/**
 * Turns model output into shadow claims, keeping only what the document itself supports (B-52).
 */
export function ground(out: ModelExtraction, input: GroundingInput): AiExtractionRecord {
  const full = input.pages.join('\n');
  const text = norm(full);
  const cins = new Set(findCins(full).map((c) => c.cin));
  const make = rowFactory(input);
  const dropped: Dropped = { ungrounded: 0, not_organisation: 0, unparsed_amount: 0 };
  const rows = [
    ...organisations(out, text, cins, make, dropped),
    ...amounts(out, text, make, dropped),
    ...out.dates.map((d) =>
      make('date', `${d.date}|${d.what}`, { date: d.date, about: d.what, page: d.page }),
    ),
    make('case_type', 'case', { about: out.case_type }),
  ];
  return {
    sha256: input.sha256,
    source_id: input.item.source_id,
    item_id: input.item.item_id,
    document_url: input.url,
    model: input.model,
    prompt_version: input.promptVersion,
    extracted_at: input.extractedAt,
    case_type: out.case_type,
    summary: out.summary,
    rows,
    dropped,
  };
}
