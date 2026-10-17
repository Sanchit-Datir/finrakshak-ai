import { defineSecret } from 'firebase-functions/params';

/**
 * Gemini API key, stored in Secret Manager (`firebase functions:secrets:set GEMINI_API_KEY`).
 * A function can read it only if it lists this secret in its `secrets` option.
 */
export const geminiApiKey: ReturnType<typeof defineSecret> = defineSecret('GEMINI_API_KEY');
