/** Default checklists, monitoring thresholds and roles. */

import type { Settings } from '../../domain/schemas.js';
import { DAY, DEMO_USERS, rupees } from './constants.js';

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
      business: ['pan', 'gst', 'bank_statement', 'financial_statements', 'itr'],
      education: ['aadhaar', 'pan', 'income_proof', 'bank_statement'],
    },
  };
}
