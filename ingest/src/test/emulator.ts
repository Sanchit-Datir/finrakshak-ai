import { Firestore } from '@google-cloud/firestore';

/** Project id used by `npm run test:emulators`; `demo-` projects never reach real GCP. */
export const EMULATOR_PROJECT = 'demo-fundtrace';

/** A Firestore client on the emulator. Fails fast when the suite is run without one. */
export function emulatorFirestore(): Firestore {
  if (process.env['FIRESTORE_EMULATOR_HOST'] === undefined)
    throw new Error('FIRESTORE_EMULATOR_HOST is not set; use npm run test:emulators');
  return new Firestore({ projectId: EMULATOR_PROJECT, ignoreUndefinedProperties: true });
}

/** Deletes every document in the emulator's database. */
export async function clearFirestore(): Promise<void> {
  const host = process.env['FIRESTORE_EMULATOR_HOST'] ?? '';
  const url = `http://${host}/emulator/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not clear the Firestore emulator: HTTP ${res.status}`);
}
