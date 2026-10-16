import {
  AIError,
  FinishReason,
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  Schema,
  type GenerativeModel,
} from 'firebase/ai';
import { LanguageSchema } from '../../domain/schemas.js';
import {
  buildExtractionPrompt,
  EXTRACTION_LIMITS,
  parseExtraction,
  type GeminiExtraction,
} from './extraction.js';
import { getFirebase } from './firebase.js';

/**
 * Gemini document extraction through Firebase AI Logic (Gemini Developer API
 * backend — works on the no-cost Spark plan). The API key is held by Firebase,
 * not shipped in the bundle; App Check limits who can spend the quota (B-08).
 */

/** A user-readable failure. `retryable` tells the UI whether "Try again" makes sense. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExtractionError';
  }
}

const RESPONSE_SCHEMA = Schema.object({
  properties: {
    docType: Schema.string({ nullable: true }),
    language: Schema.enumString({ enum: [...LanguageSchema.options] }),
    fields: Schema.array({
      items: Schema.object({
        properties: {
          key: Schema.string(),
          value: Schema.string(),
          page: Schema.integer(),
          quality: Schema.enumString({ enum: ['clear', 'low', 'handwritten', 'unreadable'] }),
        },
      }),
    }),
  },
});

let model: GenerativeModel | undefined;

function getModel(): GenerativeModel {
  const fb = getFirebase();
  if (fb === null) throw new ExtractionError('Gemini is not configured for this site.', false);
  model ??= getGenerativeModel(
    getAI(fb.app, { backend: new GoogleAIBackend() }),
    {
      model: fb.env.VITE_GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: EXTRACTION_LIMITS.maxOutputTokens,
        temperature: 0,
      },
    },
    { timeout: EXTRACTION_LIMITS.timeoutMs },
  );
  return model;
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function isRetryableStatus(e: unknown): boolean {
  const status = e instanceof AIError ? e.customErrorData?.status : undefined;
  return status === undefined || status === 429 || status >= 500;
}

/** One model call. Throws ExtractionError for blocked/truncated/malformed output (B-11..B-13). */
async function callOnce(file: File, mime: string, hint: string | null): Promise<GeminiExtraction> {
  const data = await toBase64(file);
  const res = await getModel().generateContent([
    buildExtractionPrompt(hint),
    { inlineData: { mimeType: mime, data } },
  ]);
  const candidate = res.response.candidates?.[0];
  if (res.response.promptFeedback?.blockReason !== undefined || candidate === undefined) {
    throw new ExtractionError('Gemini declined to read this document.', false);
  }
  if (candidate.finishReason === FinishReason.MAX_TOKENS) {
    throw new ExtractionError('The document has too much text to extract in one pass.', false);
  }
  const parsed = parseExtraction(res.response.text());
  if (parsed === null) throw new ExtractionError('Gemini returned an unexpected format.', true);
  return parsed;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Extracts fields with one retry (exponential backoff + jitter) on transient failures (B-14). */
export async function extractWithGemini(
  file: File,
  mime: string,
  docTypeHint: string | null,
): Promise<GeminiExtraction> {
  if (file.size > EXTRACTION_LIMITS.maxFileBytes) {
    throw new ExtractionError('File is over 14 MB, too large for automatic extraction.', false);
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(file, mime, docTypeHint);
    } catch (e) {
      const retryable = e instanceof ExtractionError ? e.retryable : isRetryableStatus(e);
      if (!retryable || attempt >= 1) {
        if (e instanceof ExtractionError) throw e;
        throw new ExtractionError('Gemini could not be reached. Try again later.', true, { cause: e });
      }
      await sleep(1_000 * 2 ** attempt + Math.random() * 500);
    }
  }
}
