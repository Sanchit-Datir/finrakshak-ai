import type { ExtractedField, Language, Region } from '../domain/schemas.js';

/**
 * Synthetic document samples rendered as SVG. All names, numbers and records
 * are fictional. Field values here are *simulated demo output*: no OCR or
 * Gemini call produced them.
 */

export interface SampleLine {
  x: number;
  y: number;
  text: string;
  size?: number;
  weight?: 400 | 600 | 700;
  hand?: boolean;
  anchor?: 'start' | 'middle';
  muted?: boolean;
}

export interface SampleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SampleField {
  key: string;
  label: string;
  value: string;
  region: Region | null;
  quality: ExtractedField['quality'];
}

export interface Sample {
  id: string;
  title: string;
  docType: string;
  language: Language;
  lines: SampleLine[];
  rects: SampleRect[];
  fields: SampleField[];
  originalText: string;
  transliteration: string | null;
  translation: string | null;
  qualityWarnings: string[];
}

export const PAGE_W = 600;
export const PAGE_H = 820;

function r(x: number, y: number, w: number, h: number): Region {
  return { x, y, w, h };
}

const satbaraJadhav: Sample = {
  id: 'satbara-jadhav',
  title: '7/12 extract — Gat 214/2, Karde',
  docType: 'satbara',
  language: 'mr',
  rects: [{ x: 28, y: 125, w: 544, h: 370 }],
  lines: [
    { x: 300, y: 50, text: 'महाराष्ट्र शासन', size: 20, weight: 700, anchor: 'middle' },
    { x: 300, y: 80, text: 'गाव नमुना सात — अधिकार अभिलेख पत्रक', size: 16, anchor: 'middle' },
    {
      x: 300,
      y: 104,
      text: '(नमुना ७/१२ — कृत्रिम नमुना / synthetic sample)',
      size: 12,
      anchor: 'middle',
      muted: true,
    },
    { x: 40, y: 155, text: 'गाव : करडे', size: 15 },
    { x: 230, y: 155, text: 'तालुका : शिरूर', size: 15 },
    { x: 420, y: 155, text: 'जिल्हा : पुणे', size: 15 },
    { x: 40, y: 195, text: 'भूमापन / गट क्रमांक : २१४/२', size: 15 },
    { x: 40, y: 235, text: 'क्षेत्र : १ हे ६२ आर', size: 15 },
    { x: 330, y: 235, text: 'आकारणी : ४.२५ रु.', size: 15 },
    { x: 40, y: 280, text: 'भोगवटादाराचे नाव :', size: 15 },
    { x: 60, y: 314, text: 'रमेश शंकर जाधव', size: 18, weight: 600 },
    { x: 40, y: 362, text: 'इतर हक्क : बोजा — निरंक', size: 15 },
    { x: 40, y: 410, text: 'पीक पाहणी (२०२५-२६) : सोयाबीन ०.८० हे, तूर ०.४० हे', size: 14 },
    { x: 40, y: 460, text: 'फेरफार क्रमांक : ३३८१', size: 14 },
    { x: 40, y: 700, text: 'दिनांक : ०४/०९/२०२६', size: 14 },
    { x: 360, y: 700, text: 'तलाठी, सजा करडे (कृत्रिम)', size: 14 },
  ],
  fields: [
    {
      key: 'applicant_name_original',
      label: 'Holder name (original)',
      value: 'रमेश शंकर जाधव',
      region: r(55, 292, 190, 30),
      quality: 'clear',
    },
    {
      key: 'applicant_name_latin',
      label: 'Holder name (transliterated)',
      value: 'Ramesh Shankar Jadhav',
      region: r(55, 292, 190, 30),
      quality: 'clear',
    },
    {
      key: 'village',
      label: 'Village (गाव)',
      value: 'करडे',
      region: r(36, 136, 120, 26),
      quality: 'clear',
    },
    {
      key: 'taluka',
      label: 'Taluka (तालुका)',
      value: 'शिरूर',
      region: r(226, 136, 130, 26),
      quality: 'clear',
    },
    {
      key: 'district',
      label: 'District (जिल्हा)',
      value: 'पुणे',
      region: r(416, 136, 120, 26),
      quality: 'clear',
    },
    {
      key: 'survey_number',
      label: 'Survey / Gat number (गट क्रमांक)',
      value: '२१४/२',
      region: r(36, 176, 250, 26),
      quality: 'clear',
    },
    {
      key: 'land_area',
      label: 'Land area (as written)',
      value: '१ हे ६२ आर',
      region: r(36, 216, 160, 26),
      quality: 'clear',
    },
    {
      key: 'encumbrance_note',
      label: 'Other rights / encumbrance (इतर हक्क)',
      value: 'बोजा — निरंक',
      region: r(36, 343, 220, 26),
      quality: 'clear',
    },
    {
      key: 'document_date',
      label: 'Document date',
      value: '०४/०९/२०२६',
      region: r(36, 681, 160, 26),
      quality: 'clear',
    },
  ],
  originalText:
    'महाराष्ट्र शासन\nगाव नमुना सात — अधिकार अभिलेख पत्रक\nगाव : करडे   तालुका : शिरूर   जिल्हा : पुणे\nभूमापन / गट क्रमांक : २१४/२\nक्षेत्र : १ हे ६२ आर   आकारणी : ४.२५ रु.\nभोगवटादाराचे नाव : रमेश शंकर जाधव\nइतर हक्क : बोजा — निरंक\nपीक पाहणी (२०२५-२६) : सोयाबीन ०.८० हे, तूर ०.४० हे\nफेरफार क्रमांक : ३३८१\nदिनांक : ०४/०९/२०२६',
  transliteration:
    'Mahārāṣṭra śāsan\nGāv namunā sāt — adhikār abhilekh patrak\nGāv: Karaḍe   Tālukā: Śirūr   Jilhā: Puṇe\nBhūmāpan / gaṭ kramāṅk: 214/2\nKṣetra: 1 he 62 ār\nBhogavaṭādārāce nāv: Rameś Śaṅkar Jādhav\nItar hakka: bojā — niraṅk',
  translation:
    'Government of Maharashtra\nVillage Form VII — Record of Rights\nVillage: Karde   Taluka: Shirur   District: Pune\nSurvey / Gat No.: 214/2\nArea: 1 hectare 62 are   Assessment: Rs 4.25\nOccupant name: Ramesh Shankar Jadhav\nOther rights: encumbrance — nil\nCrop inspection (2025-26): soybean 0.80 ha, pigeon pea 0.40 ha\nMutation no.: 3381\nDate: 04/09/2026',
  qualityWarnings: [],
};

const aadhaarJadhav: Sample = {
  id: 'aadhaar-jadhav',
  title: 'Aadhaar card (masked)',
  docType: 'aadhaar',
  language: 'mixed',
  rects: [{ x: 60, y: 150, w: 480, h: 300 }],
  lines: [
    {
      x: 300,
      y: 190,
      text: 'भारत सरकार / Government of India',
      size: 15,
      weight: 600,
      anchor: 'middle',
    },
    { x: 90, y: 250, text: 'रमेश शंकर जाधव', size: 17, weight: 600 },
    { x: 90, y: 280, text: 'Ramesh Shankar Jadhav', size: 15 },
    { x: 90, y: 315, text: 'जन्म तारीख / DOB : 12/03/1979', size: 14 },
    { x: 90, y: 345, text: 'पुरुष / Male', size: 14 },
    { x: 300, y: 410, text: 'XXXX XXXX 4821', size: 22, weight: 700, anchor: 'middle' },
    {
      x: 300,
      y: 500,
      text: 'SYNTHETIC SAMPLE — NOT A REAL AADHAAR',
      size: 12,
      anchor: 'middle',
      muted: true,
    },
  ],
  fields: [
    {
      key: 'applicant_name_original',
      label: 'Name (Marathi)',
      value: 'रमेश शंकर जाधव',
      region: r(86, 230, 180, 28),
      quality: 'clear',
    },
    {
      key: 'applicant_name_latin',
      label: 'Name (English)',
      value: 'Ramesh Shankar Jadhav',
      region: r(86, 263, 190, 24),
      quality: 'clear',
    },
    {
      key: 'dob',
      label: 'Date of birth',
      value: '12/03/1979',
      region: r(86, 298, 260, 24),
      quality: 'clear',
    },
    {
      key: 'aadhaar_masked',
      label: 'Aadhaar number (masked)',
      value: 'XXXX XXXX 4821',
      region: r(200, 386, 200, 32),
      quality: 'clear',
    },
  ],
  originalText:
    'भारत सरकार / Government of India\nरमेश शंकर जाधव\nRamesh Shankar Jadhav\nजन्म तारीख / DOB : 12/03/1979\nपुरुष / Male\nXXXX XXXX 4821',
  transliteration: 'Rameś Śaṅkar Jādhav',
  translation: 'Government of India\nRamesh Shankar Jadhav\nDate of birth: 12/03/1979\nMale',
  qualityWarnings: [],
};

const bankJadhav: Sample = {
  id: 'bank-jadhav',
  title: 'Bank statement — Apr–Sep 2026',
  docType: 'bank_statement',
  language: 'en',
  rects: [{ x: 30, y: 230, w: 540, h: 300 }],
  lines: [
    {
      x: 40,
      y: 60,
      text: 'Sahyadri Demo Gramin Bank — Statement of Account',
      size: 16,
      weight: 700,
    },
    { x: 40, y: 100, text: 'Name: RAMESH S JADHAV', size: 14 },
    { x: 40, y: 125, text: 'Account: XXXX XXXX 7710 (Savings)', size: 14 },
    { x: 40, y: 150, text: 'Period: 01-Apr-2026 to 30-Sep-2026', size: 14 },
    {
      x: 40,
      y: 255,
      text: 'Date        Description                     Credit        Debit',
      size: 12,
      weight: 600,
    },
    { x: 40, y: 285, text: '12-Apr   Milk society payment              18,200', size: 12 },
    { x: 40, y: 310, text: '28-May   Crop sale — APMC Shirur        72,500', size: 12 },
    {
      x: 40,
      y: 335,
      text: '03-Jun   Fertiliser purchase                                    14,800',
      size: 12,
    },
    { x: 40, y: 360, text: '14-Jul   Milk society payment              19,000', size: 12 },
    {
      x: 40,
      y: 385,
      text: '22-Aug   Labour wages                                               9,600',
      size: 12,
    },
    { x: 40, y: 410, text: '30-Sep   Milk society payment              19,000', size: 12 },
    { x: 40, y: 470, text: 'Average monthly credits: ₹ 31,450', size: 14, weight: 600 },
    {
      x: 300,
      y: 760,
      text: 'SYNTHETIC SAMPLE — fictional account',
      size: 12,
      anchor: 'middle',
      muted: true,
    },
  ],
  fields: [
    {
      key: 'applicant_name_latin',
      label: 'Account holder',
      value: 'RAMESH S JADHAV',
      region: r(36, 85, 220, 22),
      quality: 'clear',
    },
    {
      key: 'account_masked',
      label: 'Account (masked)',
      value: 'XXXX XXXX 7710',
      region: r(36, 110, 300, 22),
      quality: 'clear',
    },
    {
      key: 'statement_period',
      label: 'Statement period',
      value: '01-Apr-2026 to 30-Sep-2026',
      region: r(36, 135, 320, 22),
      quality: 'clear',
    },
    {
      key: 'avg_monthly_credit',
      label: 'Average monthly credits (₹)',
      value: '31450',
      region: r(36, 453, 300, 24),
      quality: 'clear',
    },
  ],
  originalText:
    'Statement of Account\nName: RAMESH S JADHAV\nAccount: XXXX XXXX 7710\nPeriod: 01-Apr-2026 to 30-Sep-2026\nAverage monthly credits: ₹ 31,450',
  transliteration: null,
  translation: null,
  qualityWarnings: [],
};

const formPawar: Sample = {
  id: 'form-pawar',
  title: 'Handwritten loan application form',
  docType: 'application_form',
  language: 'mr',
  rects: [{ x: 28, y: 110, w: 544, h: 560 }],
  lines: [
    { x: 300, y: 60, text: 'कर्ज मागणी अर्ज', size: 20, weight: 700, anchor: 'middle' },
    {
      x: 300,
      y: 88,
      text: '(कृत्रिम नमुना / synthetic sample)',
      size: 12,
      anchor: 'middle',
      muted: true,
    },
    { x: 40, y: 150, text: 'अर्जदाराचे नाव :', size: 14 },
    { x: 180, y: 152, text: 'सुनिता विलास पवार', size: 19, hand: true },
    { x: 40, y: 200, text: 'पतीचे नाव :', size: 14 },
    { x: 180, y: 202, text: 'विलास पवार', size: 19, hand: true },
    { x: 40, y: 250, text: 'जन्म तारीख :', size: 14 },
    { x: 180, y: 252, text: '०५/०८/१९८५', size: 19, hand: true },
    { x: 40, y: 300, text: 'गाव :', size: 14 },
    { x: 110, y: 302, text: 'ओतूर', size: 19, hand: true },
    { x: 280, y: 300, text: 'तालुका :', size: 14 },
    { x: 360, y: 302, text: 'जुन्नर', size: 19, hand: true },
    { x: 40, y: 350, text: 'जमीन क्षेत्र :', size: 14 },
    { x: 180, y: 352, text: '२ हेक्टर', size: 19, hand: true },
    { x: 40, y: 400, text: 'कर्ज रक्कम :', size: 14 },
    { x: 180, y: 402, text: '₹ १,८०,०००', size: 19, hand: true },
    { x: 40, y: 450, text: 'कर्जाचा उद्देश :', size: 14 },
    { x: 180, y: 452, text: 'कांदा पीक लागवड', size: 19, hand: true },
    { x: 40, y: 500, text: 'मोबाईल क्रमांक :', size: 14 },
    { x: 180, y: 502, text: '९८▒▒ ▒४▒▒▒', size: 19, hand: true, muted: true },
    { x: 40, y: 620, text: 'अर्जदाराची सही :', size: 14 },
    { x: 200, y: 622, text: 'सु. प.', size: 22, hand: true },
  ],
  fields: [
    {
      key: 'applicant_name_original',
      label: 'Applicant name (original)',
      value: 'सुनिता विलास पवार',
      region: r(176, 130, 200, 32),
      quality: 'handwritten',
    },
    {
      key: 'applicant_name_latin',
      label: 'Applicant name (transliterated)',
      value: 'Sunita Vilas Pawar',
      region: r(176, 130, 200, 32),
      quality: 'handwritten',
    },
    {
      key: 'father_spouse',
      label: 'Spouse name',
      value: 'विलास पवार',
      region: r(176, 180, 140, 32),
      quality: 'handwritten',
    },
    {
      key: 'dob',
      label: 'Date of birth',
      value: '०५/०८/१९८५',
      region: r(176, 230, 150, 32),
      quality: 'handwritten',
    },
    {
      key: 'village',
      label: 'Village (गाव)',
      value: 'ओतूर',
      region: r(106, 280, 80, 32),
      quality: 'handwritten',
    },
    {
      key: 'taluka',
      label: 'Taluka (तालुका)',
      value: 'जुन्नर',
      region: r(356, 280, 90, 32),
      quality: 'handwritten',
    },
    {
      key: 'land_area',
      label: 'Land area (as written)',
      value: '२ हेक्टर',
      region: r(176, 330, 110, 32),
      quality: 'handwritten',
    },
    {
      key: 'loan_amount',
      label: 'Loan amount requested (₹)',
      value: '१,८०,०००',
      region: r(176, 380, 140, 32),
      quality: 'handwritten',
    },
    {
      key: 'loan_purpose',
      label: 'Declared purpose',
      value: 'कांदा पीक लागवड',
      region: r(176, 430, 190, 32),
      quality: 'handwritten',
    },
    {
      key: 'mobile',
      label: 'Mobile number',
      value: '',
      region: r(176, 480, 180, 32),
      quality: 'unreadable',
    },
  ],
  originalText:
    'कर्ज मागणी अर्ज\nअर्जदाराचे नाव : सुनिता विलास पवार\nपतीचे नाव : विलास पवार\nजन्म तारीख : ०५/०८/१९८५\nगाव : ओतूर   तालुका : जुन्नर\nजमीन क्षेत्र : २ हेक्टर\nकर्ज रक्कम : ₹ १,८०,०००\nकर्जाचा उद्देश : कांदा पीक लागवड\nमोबाईल क्रमांक : [वाचता येत नाही]',
  transliteration:
    'Karj māgaṇī arj\nArjadārāce nāv: Sunitā Vilās Pavār\nPatīce nāv: Vilās Pavār\nJanma tārīkh: 05/08/1985\nGāv: Otūr   Tālukā: Junnar\nJamīn kṣetra: 2 hekṭar\nKarj rakkam: ₹ 1,80,000\nKarjācā uddeś: kāndā pīk lāgavaḍ',
  translation:
    'Loan request application\nApplicant name: Sunita Vilas Pawar\nHusband name: Vilas Pawar\nDate of birth: 05/08/1985 (handwritten — verify)\nVillage: Otur   Taluka: Junnar\nLand area: 2 hectare\nLoan amount: ₹1,80,000\nPurpose: onion crop cultivation\nMobile number: [illegible]',
  qualityWarnings: [
    'Handwritten entries — machine reading is lower-confidence than printed text.',
    'Mobile number is not legible; manual entry required.',
  ],
};

const aadhaarPawar: Sample = {
  ...aadhaarJadhav,
  id: 'aadhaar-pawar',
  lines: [
    {
      x: 300,
      y: 190,
      text: 'भारत सरकार / Government of India',
      size: 15,
      weight: 600,
      anchor: 'middle',
    },
    { x: 90, y: 250, text: 'सुनिता विलास पवार', size: 17, weight: 600 },
    { x: 90, y: 280, text: 'Sunita Vilas Pawar', size: 15 },
    { x: 90, y: 315, text: 'जन्म तारीख / DOB : 05/06/1985', size: 14 },
    { x: 90, y: 345, text: 'स्त्री / Female', size: 14 },
    { x: 300, y: 410, text: 'XXXX XXXX 1937', size: 22, weight: 700, anchor: 'middle' },
    {
      x: 300,
      y: 500,
      text: 'SYNTHETIC SAMPLE — NOT A REAL AADHAAR',
      size: 12,
      anchor: 'middle',
      muted: true,
    },
  ],
  fields: [
    {
      key: 'applicant_name_original',
      label: 'Name (Marathi)',
      value: 'सुनिता विलास पवार',
      region: r(86, 230, 190, 28),
      quality: 'clear',
    },
    {
      key: 'applicant_name_latin',
      label: 'Name (English)',
      value: 'Sunita Vilas Pawar',
      region: r(86, 263, 180, 24),
      quality: 'clear',
    },
    {
      key: 'dob',
      label: 'Date of birth',
      value: '05/06/1985',
      region: r(86, 298, 260, 24),
      quality: 'clear',
    },
    {
      key: 'aadhaar_masked',
      label: 'Aadhaar number (masked)',
      value: 'XXXX XXXX 1937',
      region: r(200, 386, 200, 32),
      quality: 'clear',
    },
  ],
  originalText:
    'भारत सरकार / Government of India\nसुनिता विलास पवार\nSunita Vilas Pawar\nजन्म तारीख / DOB : 05/06/1985\nस्त्री / Female\nXXXX XXXX 1937',
  transliteration: 'Sunitā Vilās Pavār',
  translation: 'Government of India\nSunita Vilas Pawar\nDate of birth: 05/06/1985\nFemale',
};

const satbaraPawar: Sample = {
  ...satbaraJadhav,
  id: 'satbara-pawar',
  title: '7/12 extract — Gat 57, Otur',
  lines: [
    { x: 300, y: 50, text: 'महाराष्ट्र शासन', size: 20, weight: 700, anchor: 'middle' },
    { x: 300, y: 80, text: 'गाव नमुना सात — अधिकार अभिलेख पत्रक', size: 16, anchor: 'middle' },
    {
      x: 300,
      y: 104,
      text: '(नमुना ७/१२ — कृत्रिम नमुना / synthetic sample)',
      size: 12,
      anchor: 'middle',
      muted: true,
    },
    { x: 40, y: 155, text: 'गाव : ओतूर', size: 15 },
    { x: 230, y: 155, text: 'तालुका : जुन्नर', size: 15 },
    { x: 420, y: 155, text: 'जिल्हा : पुणे', size: 15 },
    { x: 40, y: 195, text: 'भूमापन / गट क्रमांक : ५७', size: 15 },
    { x: 40, y: 235, text: 'क्षेत्र : १ हे २० आर', size: 15 },
    { x: 40, y: 280, text: 'भोगवटादाराचे नाव :', size: 15 },
    { x: 60, y: 314, text: 'सुनिता विलास पवार', size: 18, weight: 600 },
    { x: 40, y: 362, text: 'इतर हक्क : बोजा — वि.का.से. सोसायटी कर्ज ₹ ६०,०००', size: 15 },
    { x: 40, y: 410, text: 'पीक पाहणी (२०२५-२६) : कांदा १.०० हे', size: 14 },
    { x: 40, y: 700, text: 'दिनांक : २१/०८/२०२६', size: 14 },
  ],
  fields: [
    {
      key: 'applicant_name_original',
      label: 'Holder name (original)',
      value: 'सुनिता विलास पवार',
      region: r(55, 292, 200, 30),
      quality: 'clear',
    },
    {
      key: 'applicant_name_latin',
      label: 'Holder name (transliterated)',
      value: 'Sunita Vilas Pawar',
      region: r(55, 292, 200, 30),
      quality: 'clear',
    },
    {
      key: 'village',
      label: 'Village (गाव)',
      value: 'ओतूर',
      region: r(36, 136, 120, 26),
      quality: 'clear',
    },
    {
      key: 'taluka',
      label: 'Taluka (तालुका)',
      value: 'जुन्नर',
      region: r(226, 136, 130, 26),
      quality: 'clear',
    },
    {
      key: 'survey_number',
      label: 'Survey / Gat number (गट क्रमांक)',
      value: '५७',
      region: r(36, 176, 230, 26),
      quality: 'clear',
    },
    {
      key: 'land_area',
      label: 'Land area (as written)',
      value: '१ हे २० आर',
      region: r(36, 216, 160, 26),
      quality: 'clear',
    },
    {
      key: 'encumbrance_note',
      label: 'Other rights / encumbrance (इतर हक्क)',
      value: 'बोजा — वि.का.से. सोसायटी कर्ज ₹ ६०,०००',
      region: r(36, 343, 420, 26),
      quality: 'clear',
    },
  ],
  originalText:
    'गाव : ओतूर   तालुका : जुन्नर   जिल्हा : पुणे\nभूमापन / गट क्रमांक : ५७\nक्षेत्र : १ हे २० आर\nभोगवटादाराचे नाव : सुनिता विलास पवार\nइतर हक्क : बोजा — वि.का.से. सोसायटी कर्ज ₹ ६०,०००\nपीक पाहणी (२०२५-२६) : कांदा १.०० हे',
  transliteration:
    'Gāv: Otūr   Tālukā: Junnar\nGaṭ kramāṅk: 57\nKṣetra: 1 he 20 ār\nBhogavaṭādār: Sunitā Vilās Pavār',
  translation:
    'Village: Otur   Taluka: Junnar   District: Pune\nGat No.: 57\nArea: 1 hectare 20 are\nOccupant: Sunita Vilas Pawar\nOther rights: encumbrance — primary agricultural co-operative society loan ₹60,000\nCrop inspection (2025-26): onion 1.00 ha',
};

function warehouseReceipt(id: string, depositor: string, qty: string, date: string): Sample {
  return {
    id,
    title: `Warehouse receipt WR-PN-0457 — ${depositor}`,
    docType: 'warehouse_receipt',
    language: 'mixed',
    rects: [{ x: 30, y: 120, w: 540, h: 360 }],
    lines: [
      {
        x: 300,
        y: 70,
        text: 'गोदाम पावती / Warehouse Receipt',
        size: 19,
        weight: 700,
        anchor: 'middle',
      },
      {
        x: 300,
        y: 96,
        text: 'Shirur Krushi Godown (synthetic)',
        size: 13,
        anchor: 'middle',
        muted: true,
      },
      { x: 50, y: 165, text: 'Receipt No. / पावती क्र. : WR-PN-0457', size: 15, weight: 600 },
      { x: 50, y: 210, text: `Depositor / ठेवीदार : ${depositor}`, size: 15 },
      { x: 50, y: 255, text: 'Commodity / माल : Soybean (सोयाबीन)', size: 15 },
      { x: 50, y: 300, text: `Quantity / परिमाण : ${qty}`, size: 15 },
      { x: 50, y: 345, text: `Date / दिनांक : ${date}`, size: 15 },
      {
        x: 300,
        y: 760,
        text: 'SYNTHETIC SAMPLE — fictional receipt',
        size: 12,
        anchor: 'middle',
        muted: true,
      },
    ],
    fields: [
      {
        key: 'receipt_number',
        label: 'Warehouse receipt number',
        value: 'WR-PN-0457',
        region: r(46, 146, 330, 26),
        quality: 'clear',
      },
      {
        key: 'depositor_name',
        label: 'Depositor',
        value: depositor,
        region: r(46, 191, 380, 26),
        quality: 'clear',
      },
      {
        key: 'commodity',
        label: 'Commodity',
        value: 'Soybean (सोयाबीन)',
        region: r(46, 236, 330, 26),
        quality: 'clear',
      },
      {
        key: 'quantity',
        label: 'Quantity',
        value: qty,
        region: r(46, 281, 300, 26),
        quality: 'clear',
      },
      {
        key: 'document_date',
        label: 'Document date',
        value: date,
        region: r(46, 326, 260, 26),
        quality: 'clear',
      },
    ],
    originalText: `गोदाम पावती / Warehouse Receipt\nReceipt No.: WR-PN-0457\nDepositor: ${depositor}\nCommodity: Soybean (सोयाबीन)\nQuantity: ${qty}\nDate: ${date}`,
    transliteration: null,
    translation: `Warehouse receipt WR-PN-0457, depositor ${depositor}, soybean, ${qty}, dated ${date}.`,
    qualityWarnings: [],
  };
}

const SAMPLES: Sample[] = [
  satbaraJadhav,
  aadhaarJadhav,
  bankJadhav,
  formPawar,
  aadhaarPawar,
  satbaraPawar,
  warehouseReceipt('wr-ganesh', 'Ganesh Agro Traders', '420 quintal', '02/10/2026'),
  warehouseReceipt('wr-thorat', 'Dnyaneshwar Kisan Thorat', '400 quintal', '18/07/2026'),
];

const BY_ID = new Map(SAMPLES.map((s) => [s.id, s]));

export function getSample(id: string | null): Sample | undefined {
  return id === null ? undefined : BY_ID.get(id);
}

/** Samples a reviewer can attach to a new application in the capture step. */
export const ATTACHABLE_SAMPLES: readonly string[] = [
  'satbara-jadhav',
  'aadhaar-jadhav',
  'bank-jadhav',
  'form-pawar',
  'aadhaar-pawar',
  'satbara-pawar',
];
