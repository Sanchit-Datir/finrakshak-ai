/** Personal loans. */

import { rupees } from '../constants.js';
import { data } from '../application-data.js';
import type { ApplicationKit } from './kit.js';

export function seedA1006(kit: ApplicationKit): void {
  const { addApp } = kit;
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
}
