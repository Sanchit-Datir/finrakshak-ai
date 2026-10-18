/**
 * Burst limits per signed-in person, per function instance. They are a cheap brake on a runaway loop or
 * a stolen session, not a replacement for the daily AI limit (which is the real spending cap).
 * Plain constants on purpose: nothing to misconfigure, and CI deploys them with the code.
 */
export const RATE_LIMITS = {
  /** Asking Gemini: a person rarely needs more than a few questions a minute. */
  askGeminiPerMinute: 5,
  /** Analysing an application: one click per review, rarely more than a couple a minute. */
  analyseApplicationPerMinute: 3,
  /** Loading a profile happens at sign-in and on page loads; generous, but not unbounded. */
  getProfilePerMinute: 20,
  /** Opening the synthetic risk scores page, or one loan's score. */
  getRiskScoresPerMinute: 20,
} as const;

export const RATE_WINDOW_MS = 60_000;
