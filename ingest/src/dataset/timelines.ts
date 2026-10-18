import type { CaseDocumentLink, CaseEvent, DocumentRecord } from '@finrakshak-ai/shared';
import { CASE_SEEDS } from '../seed/cases.js';

export interface TimelineEntry {
  readonly date: string | null;
  readonly source_id: string;
  readonly case_type: string;
  readonly proceeding_status: string;
  readonly title: string;
  readonly url: string;
  readonly document_id: string;
  readonly matched_alias: string;
  readonly matched_in: string;
}

export interface CaseTimeline {
  readonly case_id: string;
  readonly display_name: string;
  readonly verification_status: string;
  readonly sources: string[];
  readonly first_public_record: string | null;
  readonly entries: TimelineEntry[];
}

/** Brief step 2/11: per seed case, every linked official record in date order. */
export function buildTimelines(
  links: readonly CaseDocumentLink[],
  events: readonly CaseEvent[],
  documents: readonly DocumentRecord[],
): CaseTimeline[] {
  const eventByDoc = new Map(events.map((e) => [e.document_id, e]));
  const docById = new Map(documents.map((d) => [d.document_id, d]));
  return CASE_SEEDS.map((seed) => {
    const entries = links
      .filter((l) => l.case_id === seed.case_id)
      .map((l): TimelineEntry => {
        const e = eventByDoc.get(l.document_id);
        return {
          date: l.publication_date,
          source_id: l.source_id,
          case_type: e?.case_type ?? 'unknown',
          proceeding_status: e?.proceeding_status ?? 'unknown',
          title: e?.title ?? docById.get(l.document_id)?.title ?? '',
          url: docById.get(l.document_id)?.url ?? '',
          document_id: l.document_id,
          matched_alias: l.matched_alias,
          matched_in: l.matched_in,
        };
      })
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    return {
      case_id: seed.case_id,
      display_name: seed.display_name,
      verification_status: seed.verification_status,
      sources: [...new Set(entries.map((e) => e.source_id))],
      first_public_record: entries.find((e) => e.date)?.date ?? null,
      entries,
    };
  });
}
