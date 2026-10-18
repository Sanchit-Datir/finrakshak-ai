/** What each demo application builder needs: the clock, staff names and the two id books. */

import type { Application } from '../../../domain/schemas.js';
import type { SeedContext } from '../context.js';
import type { NewApplication } from '../applications.js';
import type { NewDocument } from '../documents.js';

export interface ApplicationKit extends SeedContext {
  readonly addApp: (o: NewApplication) => Application;
  readonly link: (app: Application, ...ids: string[]) => void;
  readonly addDoc: (o: NewDocument) => string;
  /** How many documents were added so far. */
  readonly docCount: () => number;
}

export const pune = { district: 'Pune' };
