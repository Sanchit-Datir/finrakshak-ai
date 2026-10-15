import type { ApplicationData, FtDocument } from '../domain/schemas.js';
import { normalizeDate } from './checks.js';
import { parseRupeesToMinor } from './format.js';
import { parseAreaToHectares } from './land.js';
import { normalizeDigits } from './text.js';

export interface PrefillChange {
  path: string;
  label: string;
  value: string;
  source: string;
}

/**
 * Builds form values from document fields that a person has confirmed or
 * corrected. Unreviewed or unclear machine output is never used. Only empty
 * form fields are filled, so a reviewer's typed values are never overwritten.
 */
export function prefillFromDocuments(data: ApplicationData, docs: FtDocument[]): { data: ApplicationData; changes: PrefillChange[] } {
  const next = structuredClone(data);
  const changes: PrefillChange[] = [];
  const reviewed = docs.flatMap((d) => d.fields.filter((f) => (f.state === 'confirmed' || f.state === 'corrected') && f.value.trim() !== '').map((f) => ({ d, f })));
  const first = (key: string): { value: string; source: string } | undefined => {
    const hit = reviewed.find((r) => r.f.key === key);
    return hit === undefined ? undefined : { value: hit.f.value, source: `${hit.d.filename} · ${hit.f.label}` };
  };
  const fill = (path: string, label: string, current: string, key: string, set: (v: string) => void, transform: (v: string) => string | null = (v) => v): void => {
    if (current.trim() !== '') return;
    const hit = first(key);
    if (hit === undefined) return;
    const v = transform(hit.value);
    if (v === null || v === '') return;
    set(v);
    changes.push({ path, label, value: v, source: hit.source });
  };

  fill('applicant.fullName', 'Applicant name', next.applicant.fullName, 'applicant_name_latin', (v) => { next.applicant.fullName = v; });
  fill('applicant.nameOriginal', 'Name in original script', next.applicant.nameOriginal, 'applicant_name_original', (v) => { next.applicant.nameOriginal = v; });
  fill('applicant.fatherOrSpouse', 'Father / spouse name', next.applicant.fatherOrSpouse, 'father_spouse', (v) => { next.applicant.fatherOrSpouse = v; });
  fill('applicant.dob', 'Date of birth', next.applicant.dob, 'dob', (v) => { next.applicant.dob = v; }, normalizeDate);
  fill('applicant.mobile', 'Mobile', next.applicant.mobile, 'mobile', (v) => { next.applicant.mobile = v; });
  fill('address.village', 'Village', next.address.village, 'village', (v) => { next.address.village = v; });
  fill('address.taluka', 'Taluka', next.address.taluka, 'taluka', (v) => { next.address.taluka = v; });
  fill('address.district', 'District', next.address.district, 'district', (v) => { next.address.district = v; });
  fill('loan.purpose', 'Loan purpose', next.loan.purpose, 'loan_purpose', (v) => { next.loan.purpose = v; });
  fill('collateral.surveyNumber', 'Survey / Gat number', next.collateral.surveyNumber, 'survey_number', (v) => { next.collateral.surveyNumber = v; });
  fill('collateral.warehouseReceiptNo', 'Warehouse receipt', next.collateral.warehouseReceiptNo, 'receipt_number', (v) => { next.collateral.warehouseReceiptNo = v; });
  fill('business.businessName', 'Business name', next.business.businessName, 'business_name', (v) => { next.business.businessName = v; });
  fill('business.gstin', 'GSTIN', next.business.gstin, 'gstin', (v) => { next.business.gstin = v; });
  fill('business.udyamNo', 'Udyam number', next.business.udyamNo, 'udyam_number', (v) => { next.business.udyamNo = v; });
  fill('collateral.landArea', 'Land area (hectares)', next.collateral.landArea, 'land_area', (v) => { next.collateral.landArea = v; next.collateral.landUnit = 'hectare'; }, (v) => {
    const ha = parseAreaToHectares(v, 'hectare');
    return ha === null ? null : ha.toFixed(2);
  });
  if (next.loan.amountMinor === null) {
    const hit = first('loan_amount');
    const minor = hit === undefined ? null : parseRupeesToMinor(normalizeDigits(hit.value));
    if (hit !== undefined && minor !== null) {
      next.loan.amountMinor = minor;
      changes.push({ path: 'loan.amountMinor', label: 'Loan amount', value: hit.value, source: hit.source });
    }
  }
  return { data: next, changes };
}
