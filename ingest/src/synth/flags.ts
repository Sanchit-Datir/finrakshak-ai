import {
  SynthFlagSchema,
  type EvidenceStatus,
  type SourceId,
  type SynthFlag,
} from '@fund-tracker/shared';
import type { LoanBase } from './base.js';

export interface FlagInput {
  readonly caseType: string;
  readonly sourceId: SourceId;
  /** B-36: ED attachments are allegations, never upgraded to findings. */
  readonly status: EvidenceStatus;
  readonly date: string;
  readonly title: string;
  readonly proceedingStatus: string;
}

/** A public-record flag on a borrower, in the shapes the public-records check finds by exact name. */
export function makeFlag(base: LoanBase, input: FlagInput): SynthFlag {
  return SynthFlagSchema.parse({
    flag_id: `F-${base.no}`,
    entity: {
      entity_id: `ent_synth_${base.no}`,
      entity_type: 'company',
      canonical_name: base.name,
      cin: null,
      status: null,
      incorporation_date: null,
      jurisdiction: 'IN',
      aliases: [],
      match_method: 'normalized_name',
      sources: [input.sourceId],
      mention_count: 1,
    },
    event: {
      event_id: `evt_synth_${base.no}`,
      case_type: input.caseType,
      authority: 'SYNTHETIC',
      source_id: input.sourceId,
      document_id: `doc_synth_${base.no}`,
      title: input.title,
      party_names: [base.name],
      event_date: input.date,
      publication_date: input.date,
      proceeding_status: input.proceedingStatus,
      outcome: null,
      appeal_status: null,
      amounts: [],
    },
    evidence_status: input.status,
    event_date: input.date,
    synthetic: true,
  });
}
