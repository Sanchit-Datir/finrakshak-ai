import type { EvidenceStatus, ListingItem } from '@fund-tracker/shared';

export interface Classification {
  readonly case_type: string;
  readonly authority: string;
  readonly proceeding_status: string;
  readonly evidence_status: EvidenceStatus;
  /** False for events that are routine/benign (e.g. voluntary liquidation, market notices). */
  readonly adverse: boolean;
}

const c = (
  case_type: string,
  authority: string,
  proceeding_status: string,
  evidence_status: EvidenceStatus,
  adverse = true,
): Classification => ({ case_type, authority, proceeding_status, evidence_status, adverse });

function sebi(item: ListingItem): Classification {
  const col = item.collection;
  if (col.includes('settlement'))
    return c('sebi_settlement_order', 'SEBI', 'settled_without_admission', 'fact');
  if (col.includes('sat'))
    return c('sat_appellate_order', 'Securities Appellate Tribunal', 'appellate_order', 'finding');
  if (col.includes('courts')) return c('court_order', 'Court (via SEBI)', 'court_order', 'finding');
  if (/interim|ex[- ]?parte|ad[- ]interim/i.test(item.title)) {
    return c('sebi_interim_order', 'SEBI', 'interim_order', 'allegation');
  }
  if (/show cause|SCN/i.test(item.title))
    return c('sebi_show_cause', 'SEBI', 'show_cause_notice', 'allegation');
  return c('sebi_final_order', 'SEBI', 'final_order', 'finding');
}

function ed(item: ListingItem): Classification {
  const t = item.title;
  const A = 'Directorate of Enforcement';
  if (
    /(secured|obtained|resulted in) (a |the )?conviction|has been convicted|were convicted|sentenced to/i.test(
      t,
    )
  ) {
    return c('ed_conviction', A, 'conviction_reported', 'finding');
  }
  if (/fugitive economic offender/i.test(t))
    return c('ed_feo_declaration', A, 'feo_proceeding', 'finding');
  if (/prosecution complaint|charge[- ]?sheet|complaint (has been )?filed/i.test(t)) {
    return c('ed_prosecution_complaint', A, 'prosecution_complaint_filed', 'allegation');
  }
  if (/attach|PAO\b/i.test(t))
    return c('ed_provisional_attachment', A, 'provisional_attachment', 'allegation');
  if (/restitut|restor/i.test(t)) return c('ed_restitution', A, 'assets_restituted', 'fact');
  if (/arrest/i.test(t)) return c('ed_arrest', A, 'investigation', 'allegation');
  if (/search|seiz|froze|freez/i.test(t))
    return c('ed_search_seizure', A, 'investigation', 'allegation');
  return c('ed_press_release', A, 'investigation', 'allegation');
}

function ibbi(item: ListingItem): Classification {
  const t = item.fields['announcement_type'] ?? item.title;
  const A = 'IBBI / Adjudicating Authority (NCLT)';
  if (/voluntary liquidation/i.test(t))
    return c('ibbi_voluntary_liquidation', A, 'voluntary_liquidation', 'fact', false);
  if (/liquidation/i.test(t)) return c('ibbi_liquidation', A, 'liquidation', 'fact');
  if (/fast track/i.test(t)) return c('ibbi_fast_track_cirp', A, 'cirp_initiated', 'fact');
  if (/pre[- ]packaged/i.test(t)) return c('ibbi_pre_packaged', A, 'pre_packaged_process', 'fact');
  if (/personal guarantor|individual|partnership/i.test(t))
    return c('ibbi_personal_insolvency', A, 'insolvency_process', 'fact');
  return c('ibbi_cirp', A, 'cirp_initiated', 'fact');
}

function nfra(item: ListingItem): Classification {
  const A = 'National Financial Reporting Authority';
  if (/errat/i.test(item.title)) return c('nfra_order_erratum', A, 'erratum', 'fact', false);
  if (item.collection === 'nfra.aqr_reports')
    return c('nfra_audit_quality_review', A, 'review_report', 'finding');
  if (item.collection === 'nfra.frqr_reports')
    return c('nfra_financial_reporting_review', A, 'review_report', 'finding');
  if (item.collection === 'nfra.inspection_reports')
    return c('nfra_inspection_report', A, 'inspection_report', 'finding', false);
  return c('nfra_disciplinary_order', A, 'final_order', 'finding');
}

function rbi(item: ListingItem): Classification {
  const t = item.title;
  const A = 'Reserve Bank of India';
  if (/monetary penalty/i.test(t))
    return c('rbi_monetary_penalty', A, 'penalty_imposed', 'finding');
  if (/certificate of registration/i.test(t))
    return c('rbi_cor_cancellation', A, 'registration_cancelled', 'fact');
  if (/cancels? (the )?licen[cs]e/i.test(t))
    return c('rbi_licence_cancellation', A, 'licence_cancelled', 'fact');
  if (/35A|restrictions on/i.test(t)) {
    // Extensions/modifications repeat one underlying action; don't count them as new adverse events.
    return /extension|extend|modif|withdraw|lift|revok|review/i.test(t)
      ? c('rbi_section_35a_update', A, 'restrictions_updated', 'fact', false)
      : c('rbi_section_35a_directions', A, 'restrictions_imposed', 'fact');
  }
  if (/supersed/i.test(t)) return c('rbi_board_supersession', A, 'board_superseded', 'fact');
  if (/alert list/i.test(t)) return c('rbi_alert_list', A, 'alert_list_published', 'allegation');
  return c('rbi_press_release', A, 'regulatory_communication', 'fact', false);
}

function sfio(item: ListingItem): Classification {
  const A = 'Serious Fraud Investigation Office';
  if (/convicted/i.test(item.title)) return c('sfio_conviction_list', A, 'convicted', 'finding');
  if (/proclaimed/i.test(item.title))
    return c('sfio_proclaimed_offenders', A, 'proclaimed_offender', 'finding');
  return c('sfio_notice', A, 'notice', 'fact', /petition|prosecution|complaint/i.test(item.title));
}

export function classify(item: ListingItem): Classification {
  switch (item.source_id) {
    case 'sebi':
      return sebi(item);
    case 'ed':
      return ed(item);
    case 'ibbi':
      return ibbi(item);
    case 'nfra':
      return nfra(item);
    case 'rbi':
      return rbi(item);
    case 'sfio':
      return sfio(item);
    case 'mca_ogd':
    case 'nse_bse':
    case 'nclt':
    case 'ecourts_sci':
      return c('other', item.source_id, 'unknown', 'fact', false);
  }
}
