/** MSME term loans. */

import { rupees } from '../constants.js';
import { data } from '../application-data.js';
import { pune } from './kit.js';
import type { ApplicationKit } from './kit.js';

export function seedA1005(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1011(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}
