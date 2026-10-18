/** Blank and partially filled application form data. */

import type { ApplicationData } from '../../domain/schemas.js';

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
  const data = emptyData();
  return { ...data, loan: { ...data.loan, product: 'agri_term' } };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

export function data(p: DeepPartial<ApplicationData>): ApplicationData {
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
