/** Loans against warehouse receipts (pledged produce). */

import { rupees } from '../constants.js';
import { data } from '../application-data.js';
import { pune } from './kit.js';
import type { ApplicationKit } from './kit.js';

export function seedA1003(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}

export function seedA1009(kit: ApplicationKit): void {
  const { addApp, link, addDoc } = kit;
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
}
