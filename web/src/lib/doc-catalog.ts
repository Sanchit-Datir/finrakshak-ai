/**
 * Configurable document-type catalogue (spec §7). These are examples; the bank
 * configures which are required per loan product in Settings → Checklists.
 */

export interface DocType {
  key: string;
  label: string;
  labelMr?: string;
  sensitive?: boolean;
}

export interface DocGroup {
  group: string;
  types: DocType[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    group: 'Identity and KYC',
    types: [
      { key: 'aadhaar', label: 'Aadhaar card', labelMr: 'आधार कार्ड', sensitive: true },
      { key: 'pan', label: 'PAN card', sensitive: true },
      { key: 'voter_id', label: 'Voter ID' },
      { key: 'passport', label: 'Passport', sensitive: true },
      { key: 'other_identity', label: 'Other identity document' },
    ],
  },
  {
    group: 'Address',
    types: [
      { key: 'address_proof', label: 'Address proof' },
      { key: 'ration_card', label: 'Ration card', labelMr: 'शिधापत्रिका' },
      { key: 'utility_bill', label: 'Utility bill' },
      { key: 'other_address', label: 'Other address document' },
    ],
  },
  {
    group: 'Agricultural and collateral',
    types: [
      { key: 'satbara', label: '7/12 extract', labelMr: 'सातबारा उतारा' },
      { key: 'eight_a', label: '8A extract', labelMr: '८अ उतारा' },
      { key: 'mutation', label: 'Mutation entry', labelMr: 'फेरफार नोंद' },
      { key: 'land_ownership', label: 'Land ownership document' },
      { key: 'title_deed', label: 'Property document / title deed' },
      { key: 'encumbrance', label: 'Encumbrance or lien-related document' },
      { key: 'warehouse_receipt', label: 'Warehouse receipt', labelMr: 'गोदाम पावती' },
      { key: 'crop_document', label: 'Crop / agricultural supporting document' },
    ],
  },
  {
    group: 'Financial',
    types: [
      { key: 'bank_statement', label: 'Bank statement', sensitive: true },
      { key: 'income_proof', label: 'Income proof' },
      { key: 'salary_slip', label: 'Salary slip' },
      { key: 'itr', label: 'Income tax return' },
      { key: 'financial_statements', label: 'Financial statements' },
      { key: 'cash_flow', label: 'Cash-flow statement' },
      { key: 'existing_liability', label: 'Existing loan / liability statement' },
    ],
  },
  {
    group: 'Business and company',
    types: [
      { key: 'company_registration', label: 'Company / firm registration' },
      { key: 'partnership_deed', label: 'Partnership deed' },
      { key: 'gst', label: 'GST registration' },
      { key: 'udyam', label: 'Udyam / MSME certificate' },
      { key: 'board_resolution', label: 'Board resolution / authorisation' },
      { key: 'ownership_details', label: 'Ownership / director details' },
    ],
  },
  {
    group: 'Loan-specific',
    types: [
      { key: 'application_form', label: 'Loan application form', labelMr: 'कर्ज अर्ज' },
      { key: 'purpose_declaration', label: 'Loan purpose declaration' },
      { key: 'quotation', label: 'Quotation / pro forma invoice' },
      { key: 'purchase_invoice', label: 'Purchase invoice' },
      { key: 'guarantor_docs', label: 'Guarantor documents' },
      { key: 'other_supporting', label: 'Other supporting document' },
    ],
  },
];

const BY_KEY = new Map<string, DocType>(DOC_GROUPS.flatMap((g) => g.types.map((t) => [t.key, t])));

export function docTypeLabel(key: string | null): string {
  if (key === null) return 'Not classified';
  const t = BY_KEY.get(key);
  if (t === undefined) return key;
  return t.labelMr === undefined ? t.label : `${t.label} (${t.labelMr})`;
}

export function isKnownDocType(key: string): boolean {
  return BY_KEY.has(key);
}

/** Field templates offered for manual entry when automatic extraction is unavailable. */
export interface FieldTemplate {
  key: string;
  label: string;
}

const COMMON: FieldTemplate[] = [
  { key: 'applicant_name_original', label: 'Applicant name (original script)' },
  { key: 'applicant_name_latin', label: 'Applicant name (transliterated)' },
  { key: 'document_number', label: 'Document number' },
  { key: 'document_date', label: 'Document date' },
  { key: 'issuing_authority', label: 'Issuing authority' },
];

const BY_TYPE: Record<string, FieldTemplate[]> = {
  aadhaar: [
    { key: 'dob', label: 'Date of birth' },
    { key: 'aadhaar_masked', label: 'Aadhaar number (masked)' },
    { key: 'address', label: 'Address' },
  ],
  satbara: [
    { key: 'village', label: 'Village (गाव)' },
    { key: 'taluka', label: 'Taluka (तालुका)' },
    { key: 'district', label: 'District (जिल्हा)' },
    { key: 'survey_number', label: 'Survey / Gat number (गट क्रमांक)' },
    { key: 'land_area', label: 'Land area (as written)' },
    { key: 'encumbrance_note', label: 'Other rights / encumbrance (इतर हक्क)' },
  ],
  warehouse_receipt: [
    { key: 'receipt_number', label: 'Warehouse receipt number' },
    { key: 'commodity', label: 'Commodity' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'warehouse_name', label: 'Warehouse' },
  ],
  bank_statement: [
    { key: 'account_masked', label: 'Account (masked)' },
    { key: 'avg_monthly_credit', label: 'Average monthly credits (₹)' },
    { key: 'statement_period', label: 'Statement period' },
  ],
  application_form: [
    { key: 'dob', label: 'Date of birth' },
    { key: 'father_spouse', label: 'Father / spouse name' },
    { key: 'loan_amount', label: 'Loan amount requested (₹)' },
    { key: 'loan_purpose', label: 'Declared purpose' },
    { key: 'land_area', label: 'Land area (as written)' },
  ],
  gst: [
    { key: 'gstin', label: 'GSTIN' },
    { key: 'business_name', label: 'Business name' },
  ],
  udyam: [
    { key: 'udyam_number', label: 'Udyam registration number' },
    { key: 'business_name', label: 'Business name' },
  ],
};

export function fieldTemplatesFor(docType: string | null): FieldTemplate[] {
  const specific = docType === null ? [] : (BY_TYPE[docType] ?? []);
  const seen = new Set<string>();
  return [...COMMON, ...specific].filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });
}

/** Every known document-type key (the classification vocabulary offered to Gemini). */
export function allDocTypeKeys(): string[] {
  return [...BY_KEY.keys()];
}

/** Union of all field templates — the only keys automatic extraction may return. */
export function allFieldTemplates(): FieldTemplate[] {
  return fieldTemplatesFor(null).concat(
    Object.keys(BY_TYPE).flatMap((t) => fieldTemplatesFor(t)),
  ).filter((f, i, all) => all.findIndex((g) => g.key === f.key) === i);
}
