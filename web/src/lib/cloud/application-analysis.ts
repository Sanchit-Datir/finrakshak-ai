import {
  AnalyseApplicationResultSchema,
  type AnalyseApplicationInput,
  type AnalyseApplicationResult,
} from '@fund-tracker/shared';
import { explainCloudError } from './errors.js';
import type { Cloud } from './firebase.js';

/**
 * Calls the `analyseApplication` function. The browser never talks to Gemini and never holds a key:
 * the function checks sign-in, App Check, the AI allow-list and the daily limit, then calls the model.
 * The result is parsed, never cast; its text is only ever displayed.
 */
export async function analyseApplication(
  cloud: Cloud,
  input: AnalyseApplicationInput,
): Promise<AnalyseApplicationResult> {
  const { httpsCallable } = await import('@firebase/functions');
  const call = httpsCallable<AnalyseApplicationInput>(cloud.functions, 'analyseApplication');
  const response = await call(input);
  return AnalyseApplicationResultSchema.parse(response.data);
}

/** The generic wording talks about "the question"; an analysis has its own invalid-argument case. */
export function explainAnalysisError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'functions/invalid-argument')
    return 'There is too much data, or data that could not be read, for one analysis. Remove some documents and try again.';
  return explainCloudError(error);
}
