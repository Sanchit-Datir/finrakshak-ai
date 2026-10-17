/**
 * What is safe to put in a log line about a failure: its type, code and the start of its message.
 * Never pass prompts, replies, names or email addresses to the logger; user IDs are fine, they are what
 * lets you follow one person's request through the logs.
 */
export function describeError(error: unknown): {
  errorName: string;
  errorCode: string | number | null;
  errorMessage: string;
} {
  if (typeof error !== 'object' || error === null) {
    return { errorName: typeof error, errorCode: null, errorMessage: String(error).slice(0, 200) };
  }
  const code = 'code' in error ? error.code : null;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return {
    errorName: error instanceof Error ? error.name : 'object',
    errorCode: typeof code === 'string' || typeof code === 'number' ? code : null,
    errorMessage: message.slice(0, 200),
  };
}
