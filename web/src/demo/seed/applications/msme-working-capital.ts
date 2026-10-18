/** MSME working-capital loans. */

import { rupees } from '../constants.js';
import { data } from '../application-data.js';
import { pune } from './kit.js';
import type { ApplicationKit } from './kit.js';

export function seedA1007(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1010(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1013(kit: ApplicationKit): void {
  const { addApp, link, addDoc, docCount, ago, officer } = kit;
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
  const stmt1013 = `D-${String(docCount() + 4).padStart(4, '0')}`;
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
}
