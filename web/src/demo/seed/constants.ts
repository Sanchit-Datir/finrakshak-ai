/** Demo bank, demo users and unit helpers shared by the seed modules. */

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

export const DAY = 86_400_000;

export const HOUR = 3_600_000;

export function rupees(n: number): number {
  return Math.round(n * 100);
}
