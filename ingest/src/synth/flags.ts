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

/** Who the flag is about when it is not the borrower itself (a customer or another borrower). */
export interface FlagSubject {
  /** Short key that keeps ids unique, e.g. `C1`. */
  readonly suffix: string;
  readonly name: string;
}

/** A public-record flag, in the shapes the public-records check finds by exact name. The borrower unless a subject is given. */
export function makeFlag(base: LoanBase, input: FlagInput, subject?: FlagSubject): SynthFlag {
  const key = subject === undefined ? base.no : `${base.no}-${subject.suffix}`;
  const name = subject?.name ?? base.name;
  return SynthFlagSchema.parse({
    flag_id: `F-${key}`,
    entity: {
      entity_id: `ent_synth_${key}`,
      entity_type: 'company',
      canonical_name: name,
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
      event_id: `evt_synth_${key}`,
      case_type: input.caseType,
      authority: 'SYNTHETIC',
      source_id: input.sourceId,
      document_id: `doc_synth_${key}`,
      title: input.title,
      party_names: [name],
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
