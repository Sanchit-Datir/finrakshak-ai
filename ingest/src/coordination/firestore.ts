import { Firestore } from '@google-cloud/firestore';
import { getConfig } from '../config.js';

let client: Firestore | undefined;

/** One Firestore client per process, authenticated with Application Default Credentials. */
export function firestore(): Firestore {
  const storage = getConfig().storage;
  const projectId = storage.kind === 'gcs' ? storage.projectId : undefined;
  client ??= new Firestore({
    ...(projectId === undefined ? {} : { projectId }),
    ignoreUndefinedProperties: true,
  });
  return client;
}
