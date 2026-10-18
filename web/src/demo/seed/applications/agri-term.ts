/** Agricultural term loans (tractors, irrigation, land development). */

import { rupees } from '../constants.js';
import { data } from '../application-data.js';
import { pune } from './kit.js';
import type { ApplicationKit } from './kit.js';

export function seedA1008(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1012(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1014(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}
