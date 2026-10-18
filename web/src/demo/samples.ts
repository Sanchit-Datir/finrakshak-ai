/**
 * Synthetic document samples rendered as SVG. All names, numbers and records
 * are fictional. Field values here are *simulated demo output*: no OCR or
 * Gemini call produced them. One module per applicant in `./samples/`.
 */

export { PAGE_H, PAGE_W } from './samples/types.js';

export type { Sample, SampleField, SampleLine, SampleRect } from './samples/types.js';

import type { Sample } from './samples/types.js';
import { aadhaarJadhav, bankJadhav, satbaraJadhav } from './samples/jadhav.js';
import { aadhaarPawar, formPawar, satbaraPawar } from './samples/pawar.js';
import { warehouseReceipt } from './samples/warehouse.js';

const SAMPLES: Sample[] = [
  satbaraJadhav,
  aadhaarJadhav,
  bankJadhav,
  formPawar,
  aadhaarPawar,
  satbaraPawar,
  warehouseReceipt('wr-ganesh', 'Ganesh Agro Traders', '420 quintal', '02/10/2026'),
  warehouseReceipt('wr-thorat', 'Dnyaneshwar Kisan Thorat', '400 quintal', '18/07/2026'),
];

const BY_ID = new Map(SAMPLES.map((s) => [s.id, s]));

export function getSample(id: string | null): Sample | undefined {
  return id === null ? undefined : BY_ID.get(id);
}

/** Samples a reviewer can attach to a new application in the capture step. */
export const ATTACHABLE_SAMPLES: readonly string[] = [
  'satbara-jadhav',
  'aadhaar-jadhav',
  'bank-jadhav',
  'form-pawar',
  'aadhaar-pawar',
  'satbara-pawar',
];
