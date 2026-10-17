/** Fixed reply used wherever the real model must not be called (tests, emulator, CI). Costs nothing. */
export const MOCK_GEMINI_REPLY =
  '[mock] Gemini was not called: this environment uses the mock provider.';

/** Deterministic stand-in for `generateText`. It deliberately ignores the prompt (no PII is echoed). */
export function mockGenerateText(): string {
  return MOCK_GEMINI_REPLY;
}
