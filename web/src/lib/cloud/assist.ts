import { AssistResultSchema, type AssistInput, type AssistResult } from '@fund-tracker/shared';
import { explainCloudError } from './errors.js';
import type { Cloud } from './firebase.js';

/**
 * Calls the `assistRecord` function (FinRakshak Copilot). The browser never talks to Gemini and never
 * holds a key: the function checks sign-in, App Check, the AI allow-list and the daily limit, calls
 * the model and runs the grounding check (B-66). The result is parsed, never cast.
 */
export async function assistRecord(cloud: Cloud, input: AssistInput): Promise<AssistResult> {
  const { httpsCallable } = await import('@firebase/functions');
  const call = httpsCallable<AssistInput>(cloud.functions, 'assistRecord');
  const response = await call(input);
  return AssistResultSchema.parse(response.data);
}

export function explainAssistError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'functions/invalid-argument')
    return 'This record has too much data, or data that could not be read, for one request. Try a shorter question.';
  return explainCloudError(error);
}
