import { AskGeminiResultSchema, type AskGeminiResult } from '@fund-tracker/shared';
import type { Cloud } from './firebase.js';

/**
 * Calls the `askGemini` Cloud Function. The browser never talks to Gemini directly and never holds
 * a key: the function checks sign-in, App Check and the daily limit, then calls the model.
 * The reply is untrusted text and is only ever displayed, never executed or trusted as structure.
 */
export async function askGemini(cloud: Cloud, prompt: string): Promise<AskGeminiResult> {
  const { httpsCallable } = await import('@firebase/functions');
  const call = httpsCallable<{ prompt: string }>(cloud.functions, 'askGemini');
  const response = await call({ prompt });
  return AskGeminiResultSchema.parse(response.data);
}
