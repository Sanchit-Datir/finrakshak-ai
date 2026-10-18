/** Crop loans (KCC) for farmers. */

import { rupees } from '../constants.js';
import { data } from '../application-data.js';
import { pune } from './kit.js';
import type { ApplicationKit } from './kit.js';

export function seedA1001(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1002(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1015(kit: ApplicationKit): void {
  const { addApp } = kit;
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
}
