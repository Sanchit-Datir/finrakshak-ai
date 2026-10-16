import type {
  AlertState,
  Application,
  ApplicationData,
  AuditEntry,
  Borrower,
  Case,
  Db,
  Entity,
  ExtractedField,
  FtDocument,
  Loan,
  Relationship,
  Settings,
  Transaction,
} from '../domain/schemas.js';
import { monitoringAlertId } from '../lib/monitoring.js';
import { getSample } from './samples.js';

/**
 * Synthetic demonstration dataset. Every person, business, account and amount
 * is fictional. Dates are generated relative to the moment the dataset is
 * created so dashboard periods stay meaningful.
 */

export const BANK_NAME = 'Sahyadri Demo Gramin Bank';

export const DEMO_USERS = {
  branch_officer: {
    name: 'Rahul Kulkarni',
    employeeId: 'EMP-20417',
    email: 'rahul.kulkarni@demo.bank',
    branchId: 'br-shirur',
  },
  branch_manager: {
    name: 'Anjali Patil',
    employeeId: 'EMP-10233',
    email: 'anjali.patil@demo.bank',
    branchId: 'br-shirur',
  },
  risk_analyst: {
    name: 'Neha Joshi',
    employeeId: 'EMP-30871',
    email: 'neha.joshi@demo.bank',
    branchId: 'br-shirur',
  },
  investigator: {
    name: 'Farhan Shaikh',
    employeeId: 'EMP-41102',
    email: 'farhan.shaikh@demo.bank',
    branchId: 'br-shirur',
  },
  administrator: {
    name: 'Deepak Rao',
    employeeId: 'EMP-00012',
    email: 'deepak.rao@demo.bank',
    branchId: 'br-shirur',
  },
} as const;

const DAY = 86_400_000;
const HOUR = 3_600_000;

function rupees(n: number): number {
  return Math.round(n * 100);
}

let auditSeq = 0;
function audit(at: string, actor: string, action: string, detail: string): AuditEntry {
  auditSeq += 1;
  return { id: `au-${auditSeq}`, at, actor, action, detail };
}

function emptyData(): ApplicationData {
  return {
    applicant: { fullName: '', nameOriginal: '', fatherOrSpouse: '', dob: '', mobile: '' },
    loan: { product: 'kcc_crop', amountMinor: null, tenureMonths: null, purpose: '' },
    address: { line: '', village: '', taluka: '', district: '', pincode: '' },
    financial: { occupation: '', declaredAnnualIncomeMinor: null, existingLiabilitiesMinor: null },
    collateral: {
      surveyNumber: '',
      landArea: '',
      landUnit: 'hectare',
      warehouseReceiptNo: '',
      collateralValueMinor: null,
    },
    business: { businessName: '', registrationNo: '', pan: '', gstin: '', udyamNo: '' },
    guarantor: { name: '', relation: '' },
    declaration: { purposeDeclared: false, remarks: '' },
    receivables: { customers: [] },
  };
}

export function newApplicationData(): ApplicationData {
  return emptyData();
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

function data(p: DeepPartial<ApplicationData>): ApplicationData {
  const base = emptyData();
  return {
    applicant: { ...base.applicant, ...p.applicant },
    loan: { ...base.loan, ...p.loan },
    address: { ...base.address, ...p.address },
    financial: { ...base.financial, ...p.financial },
    collateral: { ...base.collateral, ...p.collateral },
    business: { ...base.business, ...p.business },
    guarantor: { ...base.guarantor, ...p.guarantor },
    declaration: { ...base.declaration, ...p.declaration },
    receivables: { customers: [...(p.receivables?.customers ?? base.receivables.customers)] },
  };
}

export function defaultSettings(): Settings {
  const u = DEMO_USERS.branch_manager;
  return {
    profile: {
      name: u.name,
      employeeId: u.employeeId,
      email: u.email,
      role: 'branch_manager',
      branchId: u.branchId,
    },
    preferences: {
      language: 'en',
      theme: 'light',
      dateFormat: 'dd-mmm-yyyy',
      timezone: 'Asia/Kolkata',
      density: 'comfortable',
      notifyNewAlerts: true,
      notifyCaseUpdates: true,
      notifyWeeklyDigest: false,
      developerMode: false,
    },
    monitoring: {
      version: 3,
      effectiveAt: new Date(Date.now() - 30 * DAY).toISOString(),
      updatedBy: DEMO_USERS.risk_analyst.name,
      rapidOnwardHours: 72,
      rapidOnwardPercent: 70,
      repeatedCounterpartyMinLoans: 2,
      repeatedCounterpartyWindowDays: 60,
      repeatedCounterpartyMinAmountMinor: rupees(100_000),
      circularWindowDays: 30,
      circularMinReturnPercent: 50,
      cashReferenceMinor: rupees(100_000),
      cashNearPercent: 90,
      cashMinCount: 3,
      cashWindowDays: 7,
      incomeMismatchRatio: 1.5,
      landAreaTolerancePercent: 5,
    },
    checklists: {
      kcc_crop: ['aadhaar', 'satbara', 'bank_statement', 'application_form'],
      agri_term: ['aadhaar', 'satbara', 'quotation', 'application_form'],
      warehouse_receipt: ['warehouse_receipt', 'aadhaar', 'bank_statement'],
      msme_working_capital: ['gst', 'udyam', 'bank_statement', 'financial_statements'],
      msme_term: ['gst', 'udyam', 'quotation', 'financial_statements', 'board_resolution'],
      personal: ['aadhaar', 'pan', 'bank_statement', 'income_proof'],
    },
  };
}

/** Builds a fresh synthetic dataset. */
export function createDemoDb(now: Date = new Date()): Db {
  auditSeq = 0;
  const t0 = now.getTime();
  const ago = (days: number, hour = 11): string => {
    const d = new Date(t0 - days * DAY);
    d.setUTCHours(hour - 5, 30, 0, 0); // ≈ local IST hour
    return d.toISOString();
  };
  const plus = (iso: string, hours: number): string =>
    new Date(new Date(iso).getTime() + hours * HOUR).toISOString();

  const officer = DEMO_USERS.branch_officer.name;
  const manager = DEMO_USERS.branch_manager.name;
  const analyst = DEMO_USERS.risk_analyst.name;
  const investigator = DEMO_USERS.investigator.name;

  // ---------- Entities ----------
  const ent = (
    id: string,
    kind: Entity['kind'],
    name: string,
    subtitle: string,
    ownerId: string | null = null,
    borrowerId: string | null = null,
  ): Entity => ({
    id,
    kind,
    name,
    subtitle,
    ownerId,
    borrowerId,
  });
  const entities: Entity[] = [
    ent('e-ramesh', 'individual', 'Ramesh Shankar Jadhav', 'Farmer, Karde', null, 'b-ramesh'),
    ent('e-sunita', 'individual', 'Sunita Vilas Pawar', 'Farmer, Otur', null, 'b-sunita'),
    ent('e-ganesh-kale', 'individual', 'Ganesh Kale', 'Proprietor', null, null),
    ent(
      'c-ganesh-agro',
      'company',
      'Ganesh Agro Traders',
      'Proprietorship, Shirur',
      null,
      'b-ganesh-agro',
    ),
    ent(
      'e-dnyaneshwar',
      'individual',
      'Dnyaneshwar Kisan Thorat',
      'Farmer, Nhavare',
      null,
      'b-dnyaneshwar',
    ),
    ent('e-mahesh', 'individual', 'Mahesh Dattatray Shinde', 'Farmer, Malegaon', null, 'b-mahesh'),
    ent('e-sachin', 'individual', 'Sachin Bhosale', 'Proprietor', null, null),
    ent(
      'c-omsai',
      'company',
      'Om Sai Krishi Seva Kendra',
      'Agri-input retailer, Junnar',
      null,
      'b-omsai',
    ),
    ent(
      'c-bhosale-infra',
      'company',
      'Bhosale Infra Developers Pvt Ltd',
      'Construction company',
      null,
      null,
    ),
    ent('c-navnath', 'company', 'Navnath Enterprises', 'Trading firm (counterparty)', null, null),
    ent('e-navnath-gade', 'individual', 'Navnath Gade', 'Guarantor named in A-1013', null, null),
    ent('e-rohit', 'individual', 'Rohit Sachin Bhosale', 'Shree Traders, Junnar', null, 'b-rohit'),
    ent('c-shivneri', 'company', 'Shivneri Agro Equipments Pvt Ltd', 'Tractor dealer', null, null),
    ent('e-vikas-more', 'individual', 'Vikas More', 'Director', null, null),
    ent('e-kiran', 'individual', 'Kiran Rajaram Gaikwad', 'Gaikwad Poultry Farm', null, 'b-kiran'),
    ent('c-godavari', 'company', 'Godavari Poultry Feeds', 'Feed supplier', null, null),
    ent('e-anil', 'individual', 'Anil Bapu Kshirsagar', 'Farmer, Indapur', null, 'b-anil'),
    ent(
      'c-sinchan',
      'company',
      'Sinchan Irrigation Supplies',
      'Drip irrigation dealer',
      null,
      null,
    ),
    ent('c-krushi', 'company', 'Shree Krushi Kendra', 'Fertiliser shop', null, null),
    ent('c-nirmal', 'company', 'Nirmal Seeds Depot', 'Seed retailer', null, null),
    ent('e-meera', 'individual', 'Meera Santosh Kulkarni', 'Individual', null, 'b-meera'),
    ent(
      'e-yogesh',
      'individual',
      'Yogesh Prakash Deshpande',
      'Deshpande & Sons (partnership)',
      null,
      'b-yogesh',
    ),
    ent(
      'c-sahyadri-food',
      'company',
      'Sahyadri Food Processors Pvt Ltd',
      'Food processing',
      null,
      'b-sahyadri-food',
    ),
    ent('e-savita', 'individual', 'Savita Dnyandev Mane', 'Farmer, Pabal', null, 'b-savita'),
    ent(
      'p-civil-117',
      'proceeding',
      'Civil suit 117 (demo record)',
      'Commercial dispute — demo entry, not a public-record lookup',
    ),
    ent('x-cash', 'counterparty', 'Cash withdrawal', 'Counter / ATM'),
  ];
  const account = (id: string, owner: string, masked: string): Entity =>
    ent(id, 'account', `A/c ${masked}`, 'Bank account (masked)', owner);
  entities.push(
    account('a-ramesh', 'e-ramesh', 'XXXX 7710'),
    account('a-mahesh', 'e-mahesh', 'XXXX 2231'),
    account('a-shivneri', 'c-shivneri', 'XXXX 9054'),
    account('a-omsai', 'c-omsai', 'XXXX 3318'),
    account('a-sachin', 'e-sachin', 'XXXX 6402'),
    account('a-bhosale-infra', 'c-bhosale-infra', 'XXXX 1187'),
    account('a-navnath', 'c-navnath', 'XXXX 5520'),
    account('a-kiran', 'e-kiran', 'XXXX 8843'),
    account('a-godavari', 'c-godavari', 'XXXX 2765'),
    account('a-anil', 'e-anil', 'XXXX 4109'),
    account('a-sinchan', 'c-sinchan', 'XXXX 7781'),
    account('a-krushi', 'c-krushi', 'XXXX 0936'),
    account('a-nirmal', 'c-nirmal', 'XXXX 3650'),
    account('a-dnyaneshwar', 'e-dnyaneshwar', 'XXXX 1290'),
  );

  // ---------- Borrowers ----------
  const borrower = (
    id: string,
    entityId: string,
    name: string,
    nameOriginal: string,
    type: Borrower['type'],
    branchId: string,
    masked: string,
    createdDays: number,
  ): Borrower => ({
    id,
    entityId,
    name,
    nameOriginal,
    type,
    branchId,
    relationshipManager: manager,
    status: 'active',
    maskedIdentifier: masked,
    createdAt: ago(createdDays),
    updatedAt: ago(Math.max(1, Math.floor(createdDays / 6))),
  });
  const borrowers: Borrower[] = [
    borrower(
      'b-ramesh',
      'e-ramesh',
      'Ramesh Shankar Jadhav',
      'रमेश शंकर जाधव',
      'farmer',
      'br-shirur',
      'Aadhaar XXXX XXXX 4821',
      420,
    ),
    borrower(
      'b-sunita',
      'e-sunita',
      'Sunita Vilas Pawar',
      'सुनिता विलास पवार',
      'farmer',
      'br-junnar',
      'Aadhaar XXXX XXXX 1937',
      6,
    ),
    borrower(
      'b-ganesh-agro',
      'c-ganesh-agro',
      'Ganesh Agro Traders',
      'गणेश ॲग्रो ट्रेडर्स',
      'proprietorship',
      'br-shirur',
      'GSTIN XXXXXXXXXX1Z5',
      9,
    ),
    borrower(
      'b-dnyaneshwar',
      'e-dnyaneshwar',
      'Dnyaneshwar Kisan Thorat',
      'ज्ञानेश्वर किसन थोरात',
      'farmer',
      'br-shirur',
      'Aadhaar XXXX XXXX 7702',
      95,
    ),
    borrower(
      'b-mahesh',
      'e-mahesh',
      'Mahesh Dattatray Shinde',
      'महेश दत्तात्रय शिंदे',
      'farmer',
      'br-baramati',
      'Aadhaar XXXX XXXX 3348',
      70,
    ),
    borrower(
      'b-omsai',
      'c-omsai',
      'Om Sai Krishi Seva Kendra',
      'ओम साई कृषी सेवा केंद्र',
      'proprietorship',
      'br-junnar',
      'GSTIN XXXXXXXXXX1Z2',
      48,
    ),
    borrower(
      'b-rohit',
      'e-rohit',
      'Rohit Sachin Bhosale',
      'रोहित सचिन भोसले',
      'proprietorship',
      'br-junnar',
      'Aadhaar XXXX XXXX 5513',
      4,
    ),
    borrower(
      'b-kiran',
      'e-kiran',
      'Kiran Rajaram Gaikwad',
      'किरण राजाराम गायकवाड',
      'proprietorship',
      'br-baramati',
      'Aadhaar XXXX XXXX 9021',
      41,
    ),
    borrower(
      'b-anil',
      'e-anil',
      'Anil Bapu Kshirsagar',
      'अनिल बापू क्षीरसागर',
      'farmer',
      'br-baramati',
      'Aadhaar XXXX XXXX 6630',
      33,
    ),
    borrower(
      'b-meera',
      'e-meera',
      'Meera Santosh Kulkarni',
      'मीरा संतोष कुलकर्णी',
      'individual',
      'br-shirur',
      'Aadhaar XXXX XXXX 2284',
      1,
    ),
    borrower(
      'b-yogesh',
      'e-yogesh',
      'Deshpande & Sons',
      'देशपांडे अँड सन्स',
      'partnership',
      'br-baramati',
      'PAN XXXXXX412F',
      3,
    ),
    borrower(
      'b-sahyadri-food',
      'c-sahyadri-food',
      'Sahyadri Food Processors Pvt Ltd',
      'सह्याद्री फूड प्रोसेसर्स प्रा. लि.',
      'private_limited',
      'br-junnar',
      'CIN XXXXXXXXXXXX0457',
      12,
    ),
    borrower(
      'b-savita',
      'e-savita',
      'Savita Dnyandev Mane',
      'सविता ज्ञानदेव माने',
      'farmer',
      'br-shirur',
      'Aadhaar XXXX XXXX 8810',
      160,
    ),
  ];

  // ---------- Documents ----------
  let docSeq = 0;
  const docs: FtDocument[] = [];
  const fieldsFrom = (
    sampleId: string,
    docId: string,
    state: ExtractedField['state'],
    reviewer: string | null,
    at: string,
  ): ExtractedField[] => {
    const s = getSample(sampleId);
    if (s === undefined) return [];
    return s.fields.map((f, i) => ({
      id: `${docId}-f${i}`,
      key: f.key,
      label: f.label,
      machineValue: f.value,
      value: f.value,
      origin: 'simulated',
      page: 0,
      region: f.region,
      quality: f.quality,
      state: f.quality === 'unreadable' ? 'unclear' : state,
      reviewedBy: state === 'unreviewed' && f.quality !== 'unreadable' ? null : reviewer,
      reviewedAt: state === 'unreviewed' && f.quality !== 'unreadable' ? null : at,
    }));
  };
  const addDoc = (o: {
    appId: string;
    borrowerId: string;
    docType: string;
    filename: string;
    days: number;
    sampleId?: string;
    state?: ExtractedField['state'];
    processing?: FtDocument['processing'];
    language?: FtDocument['language'];
    failure?: string;
    warnings?: string[];
    fields?: ExtractedField[];
  }): string => {
    docSeq += 1;
    const id = `D-${String(docSeq).padStart(4, '0')}`;
    const at = ago(o.days, 10);
    const sample = o.sampleId === undefined ? undefined : getSample(o.sampleId);
    const state = o.state ?? 'confirmed';
    const fields =
      o.fields ??
      (sample === undefined
        ? []
        : fieldsFrom(sample.id, id, state, state === 'unreviewed' ? null : officer, plus(at, 2)));
    docs.push({
      id,
      applicationId: o.appId,
      borrowerId: o.borrowerId,
      filename: o.filename,
      docType: o.docType,
      language: o.language ?? sample?.language ?? 'en',
      source: 'demo',
      mimeType: o.filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
      sizeBytes: 180_000 + docSeq * 7_919,
      pages: [{ index: 0, rotation: 0 }],
      uploadedBy: officer,
      uploadedAt: at,
      processing: o.processing ?? (state === 'unreviewed' ? 'needs_review' : 'completed'),
      failureReason: o.failure ?? null,
      qualityWarnings: o.warnings ?? sample?.qualityWarnings ?? [],
      sampleId: sample?.id ?? null,
      fields,
      audit: [audit(at, officer, 'Uploaded', `${o.filename} added (demo dataset)`)],
    });
    return id;
  };

  // ---------- Applications ----------
  const apps: Application[] = [];
  const addApp = (o: {
    id: string;
    borrowerId: string | null;
    type: Application['borrowerType'];
    branchId: string;
    status: Application['status'];
    days: number;
    data: ApplicationData;
    checks?: boolean;
    step?: number;
    notes?: string[];
  }): Application => {
    const created = ago(o.days, 10);
    const submitted = o.status === 'draft' ? null : plus(created, 3);
    const a: Application = {
      id: o.id,
      borrowerId: o.borrowerId,
      borrowerType: o.type,
      branchId: o.branchId,
      status: o.status,
      createdAt: created,
      submittedAt: submitted,
      updatedAt: plus(created, 26),
      createdBy: officer,
      step: o.step ?? 4,
      data: o.data,
      unverifiedSections: [],
      documentIds: [],
      notes: (o.notes ?? []).map((text, i) => ({
        id: `${o.id}-n${i}`,
        author: i === 0 ? officer : manager,
        at: plus(created, 5 + i * 20),
        text,
      })),
      audit: [audit(created, officer, 'Application created', 'Created from branch counter (demo)')],
      checksRunAt: o.checks === false ? null : plus(created, 4),
      findingStates: {},
      publicRecords: null,
    };
    if (submitted !== null)
      a.audit.push(
        audit(
          submitted,
          officer,
          'Status changed',
          `Set to ${o.status.replace(/_/g, ' ')} (demo state)`,
        ),
      );
    apps.push(a);
    return a;
  };
  const link = (app: Application, ...ids: string[]): void => {
    app.documentIds.push(...ids);
  };

  const pune = { district: 'Pune' };

  const a1001 = addApp({
    id: 'A-1001',
    borrowerId: 'b-ramesh',
    type: 'farmer',
    branchId: 'br-shirur',
    status: 'ready_for_decision',
    days: 2,
    data: data({
      applicant: {
        fullName: 'Ramesh Shankar Jadhav',
        nameOriginal: 'रमेश शंकर जाधव',
        fatherOrSpouse: 'Shankar Jadhav',
        dob: '1979-03-12',
        mobile: '98XXXXXX41',
      },
      loan: {
        product: 'kcc_crop',
        amountMinor: rupees(160_000),
        tenureMonths: 12,
        purpose: 'Rabi crop inputs — onion and wheat',
      },
      address: {
        line: 'At post Karde',
        village: 'Karde (करडे)',
        taluka: 'Shirur',
        pincode: '412208',
        ...pune,
      },
      financial: {
        occupation: 'Farming and dairy',
        declaredAnnualIncomeMinor: rupees(420_000),
        existingLiabilitiesMinor: rupees(0),
      },
      collateral: {
        surveyNumber: '214/2',
        landArea: '1.62',
        landUnit: 'hectare',
        collateralValueMinor: rupees(1_450_000),
      },
      declaration: {
        purposeDeclared: true,
        remarks: 'KCC renewal; previous limit repaid on time.',
      },
    }),
    notes: ['All KYC originals seen at counter.', 'Field visit done; crop as declared.'],
  });
  link(
    a1001,
    addDoc({
      appId: 'A-1001',
      borrowerId: 'b-ramesh',
      docType: 'satbara',
      filename: '712_karde_gat214.jpg',
      days: 2,
      sampleId: 'satbara-jadhav',
    }),
    addDoc({
      appId: 'A-1001',
      borrowerId: 'b-ramesh',
      docType: 'aadhaar',
      filename: 'aadhaar_ramesh_masked.jpg',
      days: 2,
      sampleId: 'aadhaar-jadhav',
    }),
    addDoc({
      appId: 'A-1001',
      borrowerId: 'b-ramesh',
      docType: 'bank_statement',
      filename: 'statement_apr_sep.pdf',
      days: 2,
      sampleId: 'bank-jadhav',
    }),
    addDoc({
      appId: 'A-1001',
      borrowerId: 'b-ramesh',
      docType: 'application_form',
      filename: 'kcc_form_signed.pdf',
      days: 2,
      language: 'mixed',
    }),
  );

  const a1002 = addApp({
    id: 'A-1002',
    borrowerId: 'b-sunita',
    type: 'farmer',
    branchId: 'br-junnar',
    status: 'needs_review',
    days: 1,
    data: data({
      applicant: {
        fullName: 'Sunita Vilas Pawar',
        nameOriginal: 'सुनिता विलास पवार',
        fatherOrSpouse: 'Vilas Pawar',
        dob: '1985-08-05',
      },
      loan: {
        product: 'kcc_crop',
        amountMinor: rupees(180_000),
        tenureMonths: 12,
        purpose: 'Onion crop cultivation (कांदा पीक लागवड)',
      },
      address: {
        line: 'Near Gram Panchayat',
        village: 'Otur (ओतूर)',
        taluka: 'Junnar',
        pincode: '412409',
        ...pune,
      },
      financial: { occupation: 'Farming', declaredAnnualIncomeMinor: rupees(260_000) },
      collateral: {
        surveyNumber: '57',
        landArea: '2',
        landUnit: 'hectare',
        collateralValueMinor: rupees(1_600_000),
      },
      guarantor: { name: 'Ramesh Shankar Jadhav', relation: 'Relative (brother-in-law)' },
      declaration: { purposeDeclared: true, remarks: '' },
    }),
  });
  link(
    a1002,
    addDoc({
      appId: 'A-1002',
      borrowerId: 'b-sunita',
      docType: 'application_form',
      filename: 'IMG_20261014_form.jpg',
      days: 1,
      sampleId: 'form-pawar',
      state: 'unreviewed',
    }),
    addDoc({
      appId: 'A-1002',
      borrowerId: 'b-sunita',
      docType: 'aadhaar',
      filename: 'IMG_20261014_aadhaar.jpg',
      days: 1,
      sampleId: 'aadhaar-pawar',
      state: 'unreviewed',
    }),
    addDoc({
      appId: 'A-1002',
      borrowerId: 'b-sunita',
      docType: 'satbara',
      filename: '712_otur_gat57.pdf',
      days: 1,
      sampleId: 'satbara-pawar',
    }),
  );

  const a1003 = addApp({
    id: 'A-1003',
    borrowerId: 'b-ganesh-agro',
    type: 'proprietorship',
    branchId: 'br-shirur',
    status: 'needs_review',
    days: 3,
    data: data({
      applicant: { fullName: 'Ganesh Kale', fatherOrSpouse: 'Baban Kale', dob: '1983-01-20' },
      loan: {
        product: 'warehouse_receipt',
        amountMinor: rupees(1_000_000),
        tenureMonths: 6,
        purpose: 'Pledge of soybean stock against warehouse receipt',
      },
      address: {
        line: 'Market Yard',
        village: 'Shirur',
        taluka: 'Shirur',
        pincode: '412210',
        ...pune,
      },
      financial: {
        occupation: 'Agri-commodity trading',
        declaredAnnualIncomeMinor: rupees(1_800_000),
      },
      collateral: { warehouseReceiptNo: 'WR-PN-0457', collateralValueMinor: rupees(1_850_000) },
      business: {
        businessName: 'Ganesh Agro Traders',
        gstin: '27XXXXXXXXXX1Z5',
        udyamNo: 'UDYAM-MH-26-XXXX1182',
      },
      declaration: { purposeDeclared: true },
    }),
  });
  link(
    a1003,
    addDoc({
      appId: 'A-1003',
      borrowerId: 'b-ganesh-agro',
      docType: 'warehouse_receipt',
      filename: 'WR-PN-0457.jpg',
      days: 3,
      sampleId: 'wr-ganesh',
    }),
    addDoc({
      appId: 'A-1003',
      borrowerId: 'b-ganesh-agro',
      docType: 'gst',
      filename: 'gst_certificate.pdf',
      days: 3,
    }),
    addDoc({
      appId: 'A-1003',
      borrowerId: 'b-ganesh-agro',
      docType: 'aadhaar',
      filename: 'aadhaar_ganesh_masked.jpg',
      days: 3,
      language: 'mixed',
    }),
    addDoc({
      appId: 'A-1003',
      borrowerId: 'b-ganesh-agro',
      docType: 'bank_statement',
      filename: 'current_ac_statement.pdf',
      days: 3,
    }),
  );

  const a1009 = addApp({
    id: 'A-1009',
    borrowerId: 'b-dnyaneshwar',
    type: 'farmer',
    branchId: 'br-shirur',
    status: 'approved',
    days: 88,
    data: data({
      applicant: {
        fullName: 'Dnyaneshwar Kisan Thorat',
        nameOriginal: 'ज्ञानेश्वर किसन थोरात',
        dob: '1976-11-02',
      },
      loan: {
        product: 'warehouse_receipt',
        amountMinor: rupees(900_000),
        tenureMonths: 6,
        purpose: 'Pledge of soybean stock',
      },
      address: { village: 'Nhavare', taluka: 'Shirur', ...pune },
      financial: { occupation: 'Farming', declaredAnnualIncomeMinor: rupees(650_000) },
      collateral: { warehouseReceiptNo: 'WR-PN-0457', collateralValueMinor: rupees(1_700_000) },
      declaration: { purposeDeclared: true },
    }),
  });
  link(
    a1009,
    addDoc({
      appId: 'A-1009',
      borrowerId: 'b-dnyaneshwar',
      docType: 'warehouse_receipt',
      filename: 'receipt_0457.jpg',
      days: 88,
      sampleId: 'wr-thorat',
    }),
    addDoc({
      appId: 'A-1009',
      borrowerId: 'b-dnyaneshwar',
      docType: 'aadhaar',
      filename: 'aadhaar_thorat_masked.jpg',
      days: 88,
      language: 'mixed',
    }),
    addDoc({
      appId: 'A-1009',
      borrowerId: 'b-dnyaneshwar',
      docType: 'bank_statement',
      filename: 'sb_statement.pdf',
      days: 88,
    }),
  );

  const a1005 = addApp({
    id: 'A-1005',
    borrowerId: 'b-sahyadri-food',
    type: 'private_limited',
    branchId: 'br-junnar',
    status: 'documents_needed',
    days: 5,
    data: data({
      applicant: { fullName: 'Prakash Deshmukh (Director)' },
      loan: {
        product: 'msme_term',
        amountMinor: rupees(3_500_000),
        tenureMonths: 60,
        purpose: 'Pulping machine for mango processing unit',
      },
      address: { line: 'MIDC plot B-14', village: 'Narayangaon', taluka: 'Junnar', ...pune },
      financial: { occupation: 'Food processing', declaredAnnualIncomeMinor: rupees(9_000_000) },
      business: {
        businessName: 'Sahyadri Food Processors Pvt Ltd',
        registrationNo: 'UXXXXXMH2019PTC0457',
      },
      declaration: { purposeDeclared: true },
    }),
  });
  link(
    a1005,
    addDoc({
      appId: 'A-1005',
      borrowerId: 'b-sahyadri-food',
      docType: 'company_registration',
      filename: 'incorporation_certificate.pdf',
      days: 5,
    }),
    addDoc({
      appId: 'A-1005',
      borrowerId: 'b-sahyadri-food',
      docType: 'financial_statements',
      filename: 'audited_fs_fy26.pdf',
      days: 5,
    }),
    addDoc({
      appId: 'A-1005',
      borrowerId: 'b-sahyadri-food',
      docType: 'quotation',
      filename: 'pulper_quotation.pdf',
      days: 5,
    }),
    addDoc({
      appId: 'A-1005',
      borrowerId: 'b-sahyadri-food',
      docType: 'udyam',
      filename: 'udyam.pdf',
      days: 5,
    }),
  );

  addApp({
    id: 'A-1006',
    borrowerId: 'b-meera',
    type: 'individual',
    branchId: 'br-shirur',
    status: 'draft',
    days: 0,
    checks: false,
    step: 1,
    data: data({
      applicant: { fullName: 'Meera Santosh Kulkarni' },
      loan: { product: 'personal', amountMinor: rupees(150_000), purpose: '' },
    }),
  });

  const a1007 = addApp({
    id: 'A-1007',
    borrowerId: 'b-yogesh',
    type: 'partnership',
    branchId: 'br-baramati',
    status: 'processing',
    days: 2,
    checks: false,
    step: 2,
    data: data({
      applicant: { fullName: 'Yogesh Prakash Deshpande' },
      loan: {
        product: 'msme_working_capital',
        amountMinor: rupees(2_000_000),
        tenureMonths: 12,
        purpose: 'Working capital for jaggery unit',
      },
      business: { businessName: 'Deshpande & Sons' },
    }),
  });
  link(
    a1007,
    addDoc({
      appId: 'A-1007',
      borrowerId: 'b-yogesh',
      docType: 'partnership_deed',
      filename: 'IMG_20261013_deed_p1.jpg',
      days: 2,
      language: 'mr',
      processing: 'needs_review',
      state: 'unreviewed',
      warnings: ['Automatic extraction is not connected — fields must be entered manually.'],
    }),
    addDoc({
      appId: 'A-1007',
      borrowerId: 'b-yogesh',
      docType: 'bank_statement',
      filename: 'IMG_20261013_stmt_dark.jpg',
      days: 2,
      processing: 'failed',
      failure:
        'Image is too dark to read reliably. Retake the photo in better light or upload a scan.',
      warnings: ['Image appears dark (average brightness 18%).'],
    }),
  );

  const a1008 = addApp({
    id: 'A-1008',
    borrowerId: 'b-mahesh',
    type: 'farmer',
    branchId: 'br-baramati',
    status: 'approved',
    days: 52,
    data: data({
      applicant: {
        fullName: 'Mahesh Dattatray Shinde',
        nameOriginal: 'महेश दत्तात्रय शिंदे',
        dob: '1981-06-14',
      },
      loan: {
        product: 'agri_term',
        amountMinor: rupees(650_000),
        tenureMonths: 60,
        purpose: 'Tractor purchase (Shivneri Agro Equipments quotation SAE/Q/0912)',
      },
      address: { village: 'Malegaon', taluka: 'Baramati', ...pune },
      financial: { occupation: 'Farming', declaredAnnualIncomeMinor: rupees(720_000) },
      collateral: {
        surveyNumber: '88/1',
        landArea: '2.40',
        landUnit: 'hectare',
        collateralValueMinor: rupees(2_100_000),
      },
      declaration: { purposeDeclared: true },
    }),
  });
  link(
    a1008,
    addDoc({
      appId: 'A-1008',
      borrowerId: 'b-mahesh',
      docType: 'quotation',
      filename: 'tractor_quotation_SAE.pdf',
      days: 52,
    }),
    addDoc({
      appId: 'A-1008',
      borrowerId: 'b-mahesh',
      docType: 'satbara',
      filename: '712_malegaon_88-1.pdf',
      days: 52,
      language: 'mr',
    }),
    addDoc({
      appId: 'A-1008',
      borrowerId: 'b-mahesh',
      docType: 'aadhaar',
      filename: 'aadhaar_mahesh_masked.jpg',
      days: 52,
      language: 'mixed',
    }),
    addDoc({
      appId: 'A-1008',
      borrowerId: 'b-mahesh',
      docType: 'application_form',
      filename: 'term_loan_form.pdf',
      days: 52,
    }),
  );

  const a1010 = addApp({
    id: 'A-1010',
    borrowerId: 'b-omsai',
    type: 'proprietorship',
    branchId: 'br-junnar',
    status: 'approved',
    days: 38,
    data: data({
      applicant: { fullName: 'Sachin Bhosale', dob: '1972-04-09' },
      loan: {
        product: 'msme_working_capital',
        amountMinor: rupees(1_200_000),
        tenureMonths: 12,
        purpose: 'Purchase of fertiliser and seed inventory',
      },
      address: { line: 'Bus stand road', village: 'Junnar', taluka: 'Junnar', ...pune },
      financial: { occupation: 'Agri-input retail', declaredAnnualIncomeMinor: rupees(2_400_000) },
      business: {
        businessName: 'Om Sai Krishi Seva Kendra',
        gstin: '27XXXXXXXXXX1Z2',
        udyamNo: 'UDYAM-MH-26-XXXX0931',
      },
      declaration: {
        purposeDeclared: true,
        remarks: 'Proprietor declared directorship in Bhosale Infra Developers Pvt Ltd.',
      },
    }),
  });
  link(
    a1010,
    addDoc({
      appId: 'A-1010',
      borrowerId: 'b-omsai',
      docType: 'udyam',
      filename: 'udyam_omsai.pdf',
      days: 38,
    }),
    addDoc({
      appId: 'A-1010',
      borrowerId: 'b-omsai',
      docType: 'gst',
      filename: 'gst_omsai.pdf',
      days: 38,
    }),
    addDoc({
      appId: 'A-1010',
      borrowerId: 'b-omsai',
      docType: 'bank_statement',
      filename: 'ca_statement_omsai.pdf',
      days: 38,
    }),
    addDoc({
      appId: 'A-1010',
      borrowerId: 'b-omsai',
      docType: 'financial_statements',
      filename: 'fs_omsai_fy26.pdf',
      days: 38,
    }),
    addDoc({
      appId: 'A-1010',
      borrowerId: 'b-omsai',
      docType: 'ownership_details',
      filename: 'director_declaration.pdf',
      days: 38,
    }),
  );

  const a1011 = addApp({
    id: 'A-1011',
    borrowerId: 'b-kiran',
    type: 'proprietorship',
    branchId: 'br-baramati',
    status: 'approved',
    days: 30,
    data: data({
      applicant: { fullName: 'Kiran Rajaram Gaikwad', dob: '1988-09-30' },
      loan: {
        product: 'msme_term',
        amountMinor: rupees(800_000),
        tenureMonths: 48,
        purpose: 'Poultry shed expansion and feed',
      },
      address: { village: 'Supe', taluka: 'Baramati', ...pune },
      financial: { occupation: 'Poultry farming', declaredAnnualIncomeMinor: rupees(1_100_000) },
      business: {
        businessName: 'Gaikwad Poultry Farm',
        gstin: '27XXXXXXXXXX1Z9',
        udyamNo: 'UDYAM-MH-26-XXXX5520',
      },
      declaration: { purposeDeclared: true },
    }),
  });
  link(
    a1011,
    addDoc({
      appId: 'A-1011',
      borrowerId: 'b-kiran',
      docType: 'gst',
      filename: 'gst_gaikwad.pdf',
      days: 30,
    }),
    addDoc({
      appId: 'A-1011',
      borrowerId: 'b-kiran',
      docType: 'udyam',
      filename: 'udyam_gaikwad.pdf',
      days: 30,
    }),
    addDoc({
      appId: 'A-1011',
      borrowerId: 'b-kiran',
      docType: 'quotation',
      filename: 'shed_material_quote.pdf',
      days: 30,
    }),
    addDoc({
      appId: 'A-1011',
      borrowerId: 'b-kiran',
      docType: 'financial_statements',
      filename: 'fs_gaikwad.pdf',
      days: 30,
    }),
  );

  const a1012 = addApp({
    id: 'A-1012',
    borrowerId: 'b-anil',
    type: 'farmer',
    branchId: 'br-baramati',
    status: 'approved',
    days: 24,
    data: data({
      applicant: {
        fullName: 'Anil Bapu Kshirsagar',
        nameOriginal: 'अनिल बापू क्षीरसागर',
        dob: '1975-12-01',
      },
      loan: {
        product: 'agri_term',
        amountMinor: rupees(400_000),
        tenureMonths: 48,
        purpose: 'Drip irrigation installation',
      },
      address: { village: 'Nimgaon Ketki', taluka: 'Indapur', ...pune },
      financial: { occupation: 'Farming', declaredAnnualIncomeMinor: rupees(380_000) },
      collateral: { surveyNumber: '412', landArea: '1.10', landUnit: 'hectare' },
      declaration: { purposeDeclared: true },
    }),
  });
  link(
    a1012,
    addDoc({
      appId: 'A-1012',
      borrowerId: 'b-anil',
      docType: 'satbara',
      filename: '712_nimgaon_412.pdf',
      days: 24,
      language: 'mr',
    }),
    addDoc({
      appId: 'A-1012',
      borrowerId: 'b-anil',
      docType: 'aadhaar',
      filename: 'aadhaar_anil_masked.jpg',
      days: 24,
      language: 'mixed',
    }),
    addDoc({
      appId: 'A-1012',
      borrowerId: 'b-anil',
      docType: 'quotation',
      filename: 'drip_quotation.pdf',
      days: 24,
    }),
    addDoc({
      appId: 'A-1012',
      borrowerId: 'b-anil',
      docType: 'application_form',
      filename: 'agri_term_form.pdf',
      days: 24,
      language: 'mr',
    }),
  );

  const a1013 = addApp({
    id: 'A-1013',
    borrowerId: 'b-rohit',
    type: 'proprietorship',
    branchId: 'br-junnar',
    status: 'needs_review',
    days: 4,
    data: data({
      applicant: {
        fullName: 'Rohit Sachin Bhosale',
        nameOriginal: 'रोहित सचिन भोसले',
        fatherOrSpouse: 'Sachin Bhosale',
        dob: '1998-02-17',
      },
      loan: {
        product: 'msme_working_capital',
        amountMinor: rupees(1_500_000),
        tenureMonths: 12,
        purpose: 'Stock purchase for Shree Traders',
      },
      address: { line: 'Bus stand road', village: 'Junnar', taluka: 'Junnar', ...pune },
      financial: { occupation: 'Trading', declaredAnnualIncomeMinor: rupees(1_800_000) },
      business: { businessName: 'Shree Traders', gstin: '27XXXXXXXXXX1Z7' },
      guarantor: { name: 'Navnath Gade', relation: 'Business associate' },
      declaration: { purposeDeclared: true },
    }),
  });
  const stmt1013 = `D-${String(docSeq + 4).padStart(4, '0')}`;
  link(
    a1013,
    addDoc({
      appId: 'A-1013',
      borrowerId: 'b-rohit',
      docType: 'gst',
      filename: 'gst_shree_traders.pdf',
      days: 4,
    }),
    addDoc({
      appId: 'A-1013',
      borrowerId: 'b-rohit',
      docType: 'udyam',
      filename: 'udyam_shree.pdf',
      days: 4,
    }),
    addDoc({
      appId: 'A-1013',
      borrowerId: 'b-rohit',
      docType: 'financial_statements',
      filename: 'provisional_fs.pdf',
      days: 4,
    }),
    addDoc({
      appId: 'A-1013',
      borrowerId: 'b-rohit',
      docType: 'bank_statement',
      filename: 'statement_shree.pdf',
      days: 4,
      fields: [
        {
          id: `${stmt1013}-f0`,
          key: 'avg_monthly_credit',
          label: 'Average monthly credits (₹)',
          machineValue: null,
          value: '62000',
          origin: 'manual',
          page: 0,
          region: null,
          quality: 'not_applicable',
          state: 'confirmed',
          reviewedBy: officer,
          reviewedAt: ago(4, 14),
        },
      ],
    }),
  );

  const a1014 = addApp({
    id: 'A-1014',
    borrowerId: 'b-ramesh',
    type: 'farmer',
    branchId: 'br-shirur',
    status: 'declined',
    days: 140,
    data: data({
      applicant: {
        fullName: 'Ramesh Shankar Jadhav',
        nameOriginal: 'रमेश शंकर जाधव',
        dob: '1979-03-12',
      },
      loan: {
        product: 'agri_term',
        amountMinor: rupees(500_000),
        tenureMonths: 48,
        purpose: 'Well deepening',
      },
      address: { village: 'Karde (करडे)', taluka: 'Shirur', ...pune },
      financial: { occupation: 'Farming and dairy', declaredAnnualIncomeMinor: rupees(400_000) },
      collateral: { surveyNumber: '२१४/२', landArea: '1 हे 62 आर', landUnit: 'hectare' },
      declaration: {
        purposeDeclared: true,
        remarks:
          'Declined by branch manager: repayment capacity insufficient for requested tenure (demo state).',
      },
    }),
  });
  link(
    a1014,
    addDoc({
      appId: 'A-1014',
      borrowerId: 'b-ramesh',
      docType: 'satbara',
      filename: '712_karde_gat214_old.jpg',
      days: 140,
      sampleId: 'satbara-jadhav',
    }),
  );

  addApp({
    id: 'A-1015',
    borrowerId: 'b-savita',
    type: 'farmer',
    branchId: 'br-shirur',
    status: 'declined',
    days: 150,
    data: data({
      applicant: { fullName: 'Savita Dnyandev Mane', nameOriginal: 'सविता ज्ञानदेव माने' },
      loan: { product: 'kcc_crop', amountMinor: rupees(120_000), purpose: 'Kharif crop inputs' },
      address: { village: 'Pabal', taluka: 'Shirur', ...pune },
      declaration: { purposeDeclared: true, remarks: 'Applicant withdrew request (demo state).' },
    }),
  });

  // ---------- Relationships ----------
  let relSeq = 0;
  const rel = (
    from: string,
    to: string,
    type: Relationship['type'],
    status: Relationship['status'],
    source: string,
    days: number,
    evidence: string,
  ): Relationship => {
    relSeq += 1;
    return { id: `r-${relSeq}`, from, to, type, status, source, observedAt: ago(days), evidence };
  };
  const relationships: Relationship[] = [
    rel(
      'e-ganesh-kale',
      'c-ganesh-agro',
      'owner_of',
      'verified',
      'GST registration certificate (A-1003)',
      3,
      'Proprietor: Ganesh Kale',
    ),
    rel(
      'e-sachin',
      'c-omsai',
      'owner_of',
      'verified',
      'Udyam certificate (A-1010)',
      38,
      'Name of entrepreneur: Sachin Bhosale',
    ),
    rel(
      'e-sachin',
      'c-bhosale-infra',
      'director_of',
      'user_provided',
      'Director declaration in A-1010 application',
      38,
      'Applicant declared directorship in Bhosale Infra Developers Pvt Ltd',
    ),
    rel(
      'e-rohit',
      'e-sachin',
      'shares_address',
      'verified',
      'Address on application A-1013 and A-1010',
      4,
      'Both list "Bus stand road, Junnar" — applicant is the son of Sachin Bhosale',
    ),
    rel(
      'e-vikas-more',
      'c-shivneri',
      'director_of',
      'user_provided',
      'Dealer quotation SAE/Q/0912 (A-1008)',
      52,
      'Quotation signed by Vikas More, Director',
    ),
    rel(
      'e-navnath-gade',
      'e-rohit',
      'guarantor_for',
      'user_provided',
      'Guarantor section of A-1013',
      4,
      'Guarantor: Navnath Gade (business associate)',
    ),
    rel(
      'e-navnath-gade',
      'c-navnath',
      'owner_of',
      'inferred',
      'Name similarity only',
      4,
      'Guarantor "Navnath Gade" and counterparty "Navnath Enterprises" share a name. No ownership record is available — possible match, not verified.',
    ),
    rel(
      'e-ramesh',
      'e-sunita',
      'guarantor_for',
      'user_provided',
      'Guarantor section of A-1002',
      1,
      'Guarantor: Ramesh Shankar Jadhav (relative)',
    ),
    rel(
      'c-ganesh-agro',
      'e-dnyaneshwar',
      'shared_identifier',
      'verified',
      'Warehouse receipts in A-1003 and A-1009',
      3,
      'Both applications cite warehouse receipt WR-PN-0457',
    ),
    rel(
      'c-bhosale-infra',
      'p-civil-117',
      'same_proceeding',
      'user_provided',
      'Analyst note — demo record, no public-record lookup performed',
      10,
      'Named as a party in a commercial dispute (demo)',
    ),
    rel(
      'c-navnath',
      'p-civil-117',
      'same_proceeding',
      'user_provided',
      'Analyst note — demo record, no public-record lookup performed',
      10,
      'Named as a party in a commercial dispute (demo)',
    ),
  ];

  // ---------- Loans & transactions ----------
  const loans: Loan[] = [];
  const txns: Transaction[] = [];
  let txSeq = 0;
  const tx = (
    loanId: string | null,
    at: string,
    fromId: string,
    toId: string,
    amountRupees: number,
    type: Transaction['type'],
    reference: string,
  ): string => {
    txSeq += 1;
    const id = `T-${String(5000 + txSeq)}`;
    txns.push({
      id,
      loanId,
      at,
      fromId,
      toId,
      amountMinor: rupees(amountRupees),
      type,
      reference,
      source: 'demo',
    });
    return id;
  };
  const addLoan = (
    id: string,
    appId: string | null,
    borrowerId: string,
    product: Loan['product'],
    amount: number,
    days: number,
    purpose: string,
    accountEntityId: string,
    branchId: string,
  ): string => {
    const at = ago(days, 11);
    loans.push({
      id,
      applicationId: appId,
      borrowerId,
      product,
      amountMinor: rupees(amount),
      disbursedAt: at,
      purpose,
      monitoringDays: 90,
      accountEntityId,
      dataSource: 'Core banking extract (demo) — accounts held at this bank only',
      lastUpdated: ago(0, 7),
      branchId,
    });
    entities.push(ent(`loan:${id}`, 'loan', id, purpose, null, borrowerId));
    relationships.push(
      rel(
        entities.find((e) => e.borrowerId === borrowerId && e.kind !== 'loan')?.id ?? borrowerId,
        `loan:${id}`,
        'borrower_for',
        'verified',
        `Loan ledger (${id})`,
        days,
        `Borrower on ${id}`,
      ),
    );
    tx(id, at, `loan:${id}`, accountEntityId, amount, 'disbursement', `Disbursement ${id}`);
    return at;
  };

  const d108 = addLoan(
    'L-2026-0108',
    'A-1008',
    'b-mahesh',
    'agri_term',
    650_000,
    40,
    'Tractor purchase',
    'a-mahesh',
    'br-baramati',
  );
  tx(
    'L-2026-0108',
    plus(d108, 26),
    'a-mahesh',
    'a-shivneri',
    620_000,
    'rtgs',
    'Tractor invoice SAE/2026/311',
  );
  tx(
    'L-2026-0108',
    plus(d108, 120),
    'a-mahesh',
    'x-cash',
    15_000,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx('L-2026-0108', plus(d108, 290), 'a-mahesh', 'a-krushi', 8_400, 'upi', 'Fertiliser');

  const d110 = addLoan(
    'L-2026-0110',
    'A-1010',
    'b-omsai',
    'msme_working_capital',
    1_200_000,
    25,
    'Fertiliser and seed inventory',
    'a-omsai',
    'br-junnar',
  );
  tx(
    'L-2026-0110',
    plus(d110, 20),
    'a-omsai',
    'a-bhosale-infra',
    500_000,
    'rtgs',
    'Advance — material',
  );
  const circ1 = tx(
    'L-2026-0110',
    plus(d110, 30),
    'a-omsai',
    'a-navnath',
    400_000,
    'neft',
    'Supply advance',
  );
  tx(null, plus(d110, 74), 'a-navnath', 'a-sachin', 380_000, 'imps', 'Refund');
  tx(null, plus(d110, 98), 'a-sachin', 'a-omsai', 350_000, 'neft', 'Capital introduction');
  tx('L-2026-0110', plus(d110, 216), 'a-omsai', 'a-krushi', 110_000, 'neft', 'Fertiliser stock');
  tx('L-2026-0110', plus(d110, 264), 'a-omsai', 'a-nirmal', 85_000, 'neft', 'Seed stock');

  const d111 = addLoan(
    'L-2026-0111',
    'A-1011',
    'b-kiran',
    'msme_term',
    800_000,
    18,
    'Poultry shed expansion and feed',
    'a-kiran',
    'br-baramati',
  );
  tx('L-2026-0111', plus(d111, 50), 'a-kiran', 'a-godavari', 180_000, 'neft', 'Feed purchase');
  tx('L-2026-0111', plus(d111, 145), 'a-kiran', 'a-navnath', 250_000, 'rtgs', 'Shed material');
  tx('L-2026-0111', plus(d111, 290), 'a-kiran', 'a-godavari', 120_000, 'neft', 'Feed purchase');

  const d112 = addLoan(
    'L-2026-0112',
    'A-1012',
    'b-anil',
    'agri_term',
    400_000,
    12,
    'Drip irrigation installation',
    'a-anil',
    'br-baramati',
  );
  tx(
    'L-2026-0112',
    plus(d112, 24),
    'a-anil',
    'x-cash',
    95_000,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx(
    'L-2026-0112',
    plus(d112, 49),
    'a-anil',
    'x-cash',
    98_000,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx(
    'L-2026-0112',
    plus(d112, 97),
    'a-anil',
    'x-cash',
    97_500,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx(
    'L-2026-0112',
    plus(d112, 145),
    'a-anil',
    'a-sinchan',
    60_000,
    'neft',
    'Drip kit part payment',
  );

  const d091 = addLoan(
    'L-2026-0091',
    null,
    'b-ramesh',
    'kcc_crop',
    160_000,
    70,
    'Kharif crop inputs',
    'a-ramesh',
    'br-shirur',
  );
  tx('L-2026-0091', plus(d091, 72), 'a-ramesh', 'a-krushi', 32_000, 'upi', 'Fertiliser');
  tx('L-2026-0091', plus(d091, 120), 'a-ramesh', 'a-nirmal', 41_000, 'neft', 'Soybean seed');
  tx(
    'L-2026-0091',
    plus(d091, 216),
    'a-ramesh',
    'x-cash',
    20_000,
    'cash_withdrawal',
    'Labour wages',
  );
  tx('L-2026-0091', plus(d091, 720), 'a-ramesh', 'a-krushi', 18_500, 'upi', 'Pesticide');
  tx(
    'L-2026-0091',
    plus(d091, 1440),
    'a-ramesh',
    'loan:L-2026-0091',
    25_000,
    'repayment',
    'Interest servicing',
  );

  // Warehouse-receipt loan with no transaction data imported.
  const d109 = ago(60, 11);
  loans.push({
    id: 'L-2026-0109',
    applicationId: 'A-1009',
    borrowerId: 'b-dnyaneshwar',
    product: 'warehouse_receipt',
    amountMinor: rupees(900_000),
    disbursedAt: d109,
    purpose: 'Pledge of soybean stock',
    monitoringDays: 90,
    accountEntityId: 'a-dnyaneshwar',
    dataSource: 'No transaction file imported',
    lastUpdated: d109,
    branchId: 'br-shirur',
  });
  entities.push(
    ent(
      'loan:L-2026-0109',
      'loan',
      'L-2026-0109',
      'Pledge of soybean stock',
      null,
      'b-dnyaneshwar',
    ),
  );
  relationships.push(
    rel(
      'e-dnyaneshwar',
      'loan:L-2026-0109',
      'borrower_for',
      'verified',
      'Loan ledger (L-2026-0109)',
      60,
      'Borrower on L-2026-0109',
    ),
  );

  // ---------- Alert states (others default to New) ----------
  const st = (
    status: AlertState['status'],
    actor: string,
    days: number,
    reason: string | null,
    note?: string,
  ): AlertState => ({
    status,
    assignee: actor,
    resolutionReason: reason,
    notes:
      note === undefined
        ? []
        : [{ id: `an-${days}-${status}`, author: actor, at: ago(days, 15), text: note }],
    audit: [
      audit(
        ago(days, 15),
        actor,
        'Status changed',
        `New → ${status.replace(/_/g, ' ')}${reason === null ? '' : `: ${reason}`}`,
      ),
    ],
  });
  const alertStates: Record<string, AlertState> = {
    [monitoringAlertId('rapid_onward', 'L-2026-0108')]: st(
      'resolved',
      analyst,
      30,
      'Payment to authorised tractor dealer matches quotation SAE/Q/0912; invoice and RC copy verified at branch.',
      'Invoice SAE/2026/311 and RTO registration copy received.',
    ),
    [monitoringAlertId('circular', 'L-2026-0110', circ1)]: st(
      'escalated',
      investigator,
      18,
      null,
      'Escalated to CASE-2026-014.',
    ),
    [monitoringAlertId('linked_counterparty', 'L-2026-0110', 'c-bhosale-infra')]: st(
      'in_review',
      investigator,
      19,
      null,
    ),
    [monitoringAlertId('rapid_onward', 'L-2026-0110')]: st('in_review', analyst, 20, null),
    [monitoringAlertId('cash_split', 'L-2026-0112')]: st(
      'in_review',
      analyst,
      6,
      null,
      'Borrower says cash paid to installation labour; vouchers requested.',
    ),
  };

  // ---------- Cases ----------
  const caseAudit = (
    opened: string,
    owner: string,
    statuses: [string, number, string][],
  ): AuditEntry[] => [
    audit(opened, owner, 'Case opened', 'Created from alert'),
    ...statuses.map(([s, d, reason]) =>
      audit(ago(d, 16), owner, 'Status changed', `→ ${s}: ${reason}`),
    ),
  ];
  const cases: Case[] = [
    {
      id: 'CASE-2026-014',
      title: 'Possible circular movement after working-capital disbursement',
      priority: 'urgent',
      status: 'in_review',
      owner: investigator,
      branchId: 'br-junnar',
      summary:
        "Part of the L-2026-0110 disbursement moved to Navnath Enterprises and an equivalent amount returned to the borrower via the proprietor's personal account within four days. A separate payment went to a company where the proprietor is a declared director.",
      openedAt: ago(19, 12),
      updatedAt: ago(2, 16),
      source: 'monitoring',
      borrowerIds: ['b-omsai', 'b-rohit'],
      entityIds: ['c-omsai', 'e-sachin', 'c-navnath', 'c-bhosale-infra'],
      loanIds: ['L-2026-0110'],
      applicationIds: ['A-1010', 'A-1013'],
      alertIds: [
        monitoringAlertId('circular', 'L-2026-0110', circ1),
        monitoringAlertId('linked_counterparty', 'L-2026-0110', 'c-bhosale-infra'),
      ],
      evidence: [
        {
          id: 'ev-1',
          sourceName: 'Core banking extract (demo)',
          sourceType: 'transaction_record',
          reference: 'T-5007 → T-5008 → T-5009',
          collectedAt: ago(19, 12),
          excerpt:
            '₹4,00,000 to Navnath Enterprises; ₹3,80,000 Navnath → Sachin Bhosale; ₹3,50,000 Sachin Bhosale → Om Sai',
          status: 'verified_source',
          link: '/monitoring?loan=L-2026-0110',
        },
        {
          id: 'ev-2',
          sourceName: 'Udyam certificate (A-1010)',
          sourceType: 'uploaded_document',
          reference: 'A-1010 · udyam_omsai.pdf · p.1',
          collectedAt: ago(19, 13),
          excerpt: 'Name of entrepreneur: Sachin Bhosale',
          status: 'verified_source',
          link: '/applications/A-1010?tab=documents',
        },
        {
          id: 'ev-3',
          sourceName: 'Director declaration (A-1010)',
          sourceType: 'uploaded_document',
          reference: 'A-1010 · director_declaration.pdf',
          collectedAt: ago(19, 13),
          excerpt: 'Applicant declared directorship in Bhosale Infra Developers Pvt Ltd',
          status: 'user_provided',
          link: '/applications/A-1010?tab=documents',
        },
        {
          id: 'ev-4',
          sourceName: 'Navnath Enterprises ownership',
          sourceType: 'internal_record',
          reference: 'Relationship r-7',
          collectedAt: ago(4, 12),
          excerpt: 'Possible match to guarantor Navnath Gade (A-1013) by name only',
          status: 'unverified',
          link: null,
        },
      ],
      notes: [
        {
          id: 'cn-1',
          author: investigator,
          at: ago(17, 12),
          text: 'Requested supply contract and refund note from borrower.',
        },
        {
          id: 'cn-2',
          author: investigator,
          at: ago(2, 16),
          text: 'Borrower states Navnath order was cancelled; awaiting written confirmation.',
        },
      ],
      checklist: [
        { id: 'ck-1', text: 'Obtain supply contract with Navnath Enterprises', done: true },
        { id: 'ck-2', text: 'Obtain refund / cancellation note', done: false },
        { id: 'ck-3', text: 'Verify inventory at shop (site visit)', done: false },
        { id: 'ck-4', text: 'Confirm Bhosale Infra invoice and goods delivered', done: false },
      ],
      audit: caseAudit(ago(19, 12), investigator, [
        ['Triage', 19, 'Alert escalated by analyst'],
        ['In review', 17, 'Documents requested from borrower'],
      ]),
      outcome: null,
    },
    {
      id: 'CASE-2026-012',
      title: 'Warehouse receipt WR-PN-0457 cited in two applications',
      priority: 'urgent',
      status: 'information_requested',
      owner: analyst,
      branchId: 'br-shirur',
      summary:
        'Warehouse receipt WR-PN-0457 was pledged for L-2026-0109 (approved, outstanding) and is cited again in new application A-1003 by a different depositor.',
      openedAt: ago(3, 15),
      updatedAt: ago(1, 12),
      source: 'pre_disbursement',
      borrowerIds: ['b-ganesh-agro', 'b-dnyaneshwar'],
      entityIds: ['c-ganesh-agro', 'e-dnyaneshwar'],
      loanIds: ['L-2026-0109'],
      applicationIds: ['A-1003', 'A-1009'],
      alertIds: [],
      evidence: [
        {
          id: 'ev-5',
          sourceName: 'Warehouse receipt (A-1003)',
          sourceType: 'uploaded_document',
          reference: 'A-1003 · WR-PN-0457.jpg · p.1 · Receipt No.',
          collectedAt: ago(3, 15),
          excerpt: 'Receipt No.: WR-PN-0457 · Depositor: Ganesh Agro Traders · 420 quintal',
          status: 'user_provided',
          link: '/applications/A-1003?tab=documents',
        },
        {
          id: 'ev-6',
          sourceName: 'Warehouse receipt (A-1009)',
          sourceType: 'uploaded_document',
          reference: 'A-1009 · receipt_0457.jpg · p.1 · Receipt No.',
          collectedAt: ago(3, 15),
          excerpt: 'Receipt No.: WR-PN-0457 · Depositor: Dnyaneshwar Kisan Thorat · 400 quintal',
          status: 'user_provided',
          link: '/applications/A-1009?tab=documents',
        },
        {
          id: 'ev-7',
          sourceName: 'Warehouse operator confirmation',
          sourceType: 'internal_record',
          reference: 'Letter requested',
          collectedAt: ago(1, 12),
          excerpt: 'Awaiting written confirmation of receipt status from Shirur Krushi Godown',
          status: 'unverified',
          link: null,
        },
      ],
      notes: [
        {
          id: 'cn-3',
          author: analyst,
          at: ago(1, 12),
          text: 'Wrote to warehouse operator to confirm which depositor holds the receipt and whether a lien is marked.',
        },
      ],
      checklist: [
        { id: 'ck-5', text: 'Confirm receipt status with warehouse operator', done: false },
        { id: 'ck-6', text: 'Check lien marking for L-2026-0109', done: true },
        { id: 'ck-7', text: 'Hold A-1003 pending confirmation', done: true },
      ],
      audit: caseAudit(ago(3, 15), analyst, [
        ['Information requested', 1, 'Letter sent to warehouse operator'],
      ]),
      outcome: null,
    },
    {
      id: 'CASE-2026-009',
      title: 'Rapid transfer after tractor loan disbursement',
      priority: 'routine',
      status: 'resolved',
      owner: analyst,
      branchId: 'br-baramati',
      summary: '95% of L-2026-0108 moved to the tractor dealer within 26 hours of disbursement.',
      openedAt: ago(38, 12),
      updatedAt: ago(30, 15),
      source: 'monitoring',
      borrowerIds: ['b-mahesh'],
      entityIds: ['e-mahesh', 'c-shivneri'],
      loanIds: ['L-2026-0108'],
      applicationIds: ['A-1008'],
      alertIds: [monitoringAlertId('rapid_onward', 'L-2026-0108')],
      evidence: [
        {
          id: 'ev-8',
          sourceName: 'Dealer quotation (A-1008)',
          sourceType: 'uploaded_document',
          reference: 'A-1008 · tractor_quotation_SAE.pdf',
          collectedAt: ago(38, 12),
          excerpt: 'Quotation SAE/Q/0912 — ₹6,20,000',
          status: 'verified_source',
          link: '/applications/A-1008?tab=documents',
        },
        {
          id: 'ev-9',
          sourceName: 'Tax invoice',
          sourceType: 'internal_record',
          reference: 'Invoice SAE/2026/311',
          collectedAt: ago(30, 12),
          excerpt: 'Invoice amount matches transfer T-5002',
          status: 'verified_source',
          link: null,
        },
      ],
      notes: [
        {
          id: 'cn-4',
          author: analyst,
          at: ago(30, 15),
          text: 'Payment consistent with stated purpose; tractor seen at site visit.',
        },
      ],
      checklist: [
        { id: 'ck-8', text: 'Obtain tax invoice', done: true },
        { id: 'ck-9', text: 'Site visit', done: true },
      ],
      audit: caseAudit(ago(38, 12), analyst, [
        ['In review', 36, 'Invoice requested'],
        ['Resolved', 30, 'Benign: payment to authorised dealer matching quotation'],
      ]),
      outcome:
        'No concern found: payment to authorised dealer matched the quotation; invoice and asset verified.',
    },
    {
      id: 'CASE-2026-015',
      title: 'Split cash withdrawals after drip-irrigation loan',
      priority: 'needs_attention',
      status: 'triage',
      owner: analyst,
      branchId: 'br-baramati',
      summary:
        'Three cash withdrawals just below ₹1,00,000 within four days of disbursement of L-2026-0112.',
      openedAt: ago(6, 12),
      updatedAt: ago(6, 15),
      source: 'monitoring',
      borrowerIds: ['b-anil'],
      entityIds: ['e-anil'],
      loanIds: ['L-2026-0112'],
      applicationIds: ['A-1012'],
      alertIds: [monitoringAlertId('cash_split', 'L-2026-0112')],
      evidence: [
        {
          id: 'ev-10',
          sourceName: 'Core banking extract (demo)',
          sourceType: 'transaction_record',
          reference: 'T-5017, T-5018, T-5019',
          collectedAt: ago(6, 12),
          excerpt: 'Cash ₹95,000; ₹98,000; ₹97,500',
          status: 'verified_source',
          link: '/monitoring?loan=L-2026-0112',
        },
      ],
      notes: [],
      checklist: [
        { id: 'ck-10', text: 'Request labour/contractor vouchers', done: false },
        { id: 'ck-11', text: 'Confirm installation progress at site', done: false },
      ],
      audit: caseAudit(ago(6, 12), analyst, [['Triage', 6, 'Opened from alert']]),
      outcome: null,
    },
    {
      id: 'CASE-2026-007',
      title: 'Name spelling variation across KYC documents',
      priority: 'routine',
      status: 'closed',
      owner: manager,
      branchId: 'br-shirur',
      summary: 'Applicant name appeared as "Savita" and "Sawita" across documents.',
      openedAt: ago(150, 12),
      updatedAt: ago(140, 12),
      source: 'pre_disbursement',
      borrowerIds: ['b-savita'],
      entityIds: ['e-savita'],
      loanIds: [],
      applicationIds: ['A-1015'],
      alertIds: [],
      evidence: [
        {
          id: 'ev-11',
          sourceName: 'In-person KYC',
          sourceType: 'internal_record',
          reference: 'Branch visit',
          collectedAt: ago(141, 12),
          excerpt: 'Original documents seen; transliteration variant only',
          status: 'verified_source',
          link: null,
        },
      ],
      notes: [
        {
          id: 'cn-5',
          author: manager,
          at: ago(140, 12),
          text: 'Transliteration variant; identity confirmed in person.',
        },
      ],
      checklist: [],
      audit: caseAudit(ago(150, 12), manager, [
        ['Resolved', 141, 'Identity confirmed in person'],
        ['Closed', 140, 'No further action'],
      ]),
      outcome: 'Spelling variation explained by transliteration; identity confirmed in person.',
    },
  ];

  return {
    version: 1,
    generatedAt: now.toISOString(),
    bankName: BANK_NAME,
    branches: [
      { id: 'br-shirur', name: 'Shirur Branch' },
      { id: 'br-junnar', name: 'Junnar Branch' },
      { id: 'br-baramati', name: 'Baramati Branch' },
    ],
    borrowers,
    applications: apps,
    documents: docs,
    entities,
    relationships,
    loans,
    transactions: txns,
    alertStates,
    cases,
    settings: defaultSettings(),
    readAlertIds: [],
    counters: { application: 1015, document: docSeq, case: 15 },
  };
}

/** A workspace with no records — used to demonstrate empty states. */
export function createEmptyDb(now: Date = new Date()): Db {
  const demo = createDemoDb(now);
  return {
    ...demo,
    borrowers: [],
    applications: [],
    documents: [],
    entities: demo.entities.filter((e) => e.kind === 'counterparty'),
    relationships: [],
    loans: [],
    transactions: [],
    alertStates: {},
    cases: [],
    counters: { application: 1000, document: 0, case: 0 },
  };
}
