import {
  InvestigateApplicationResultSchema,
  type InvestigateApplicationInput,
  type InvestigateApplicationResult,
} from '@finrakshak-ai/shared';
import { explainCloudError } from './errors.js';
import type { Cloud } from './firebase.js';

/**
 * Calls the `investigateApplication` function. The browser never talks to Gemini: the function checks
 * sign-in, App Check, the AI allow-list and the daily limit, runs the tool loop and verifies every
 * claim. The result is parsed, never cast; its text is only ever displayed.
 */
export async function investigateApplication(
  cloud: Cloud,
  input: InvestigateApplicationInput,
): Promise<InvestigateApplicationResult> {
  const { httpsCallable } = await import('@firebase/functions');
  const call = httpsCallable<InvestigateApplicationInput>(
    cloud.functions,
    'investigateApplication',
    {
      timeout: 130_000,
    },
  );
  const response = await call(input);
  return InvestigateApplicationResultSchema.parse(response.data);
}

export function explainInvestigationError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'functions/invalid-argument')
    return 'There is too much data, or data that could not be read, for one investigation. Shorten long fields and try again.';
  return explainCloudError(error);
}
