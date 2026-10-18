function codeOf(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = error.code;
  return typeof code === 'string' ? code : '';
}

/** The server tells the two "resource-exhausted" cases apart with details.reason. */
function detailsOf(error: unknown): { reason: string; retryAfterSeconds: number | null } {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return { reason: '', retryAfterSeconds: null };
  }
  const details = error.details;
  if (typeof details !== 'object' || details === null)
    return { reason: '', retryAfterSeconds: null };
  const reason = 'reason' in details && typeof details.reason === 'string' ? details.reason : '';
  const wait =
    'retryAfterSeconds' in details && typeof details.retryAfterSeconds === 'number'
      ? details.retryAfterSeconds
      : null;
  return { reason, retryAfterSeconds: wait };
}

/** Turns a Firebase Auth / Functions error into a sentence a bank officer can act on. Never shows raw errors. */
export function explainCloudError(error: unknown): string {
  switch (codeOf(error)) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'The email or password is not correct.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
    case 'functions/unavailable':
      return 'Could not reach the service. Check your connection and try again.';
    case 'functions/unauthenticated':
      return 'Your sign-in or app check was not accepted. Sign in again; if it persists, the site is not fully set up for this address.';
    case 'functions/internal': {
      const { reason } = detailsOf(error);
      if (reason === 'profile_lookup_failed') {
        return 'Your account is valid, but your profile could not be loaded. Please tell an administrator and give them the reference below.';
      }
      if (reason === 'access_lookup_failed') {
        return 'We could not check your access just now. Try again, and if it keeps happening tell an administrator and give them the reference below.';
      }
      return 'Something went wrong on our side. Try again; if it keeps happening tell an administrator and give them the reference below.';
    }
    case 'functions/permission-denied':
      return 'This account is not enabled for AI features yet. Send your account ID (shown above) to an administrator.';
    case 'functions/resource-exhausted': {
      const { reason, retryAfterSeconds } = detailsOf(error);
      if (reason === 'rate_limit') {
        return retryAfterSeconds === null
          ? 'You are sending requests too quickly. Wait a moment and try again.'
          : `You are sending requests too quickly. Wait ${String(retryAfterSeconds)} seconds and try again.`;
      }
      return 'You have used today’s AI allowance. It resets at midnight India time.';
    }
    case 'functions/invalid-argument':
      return 'The question is empty or too long.';
    case 'functions/deadline-exceeded':
      return 'The AI took too long to answer. Try a shorter question.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/**
 * A short line a person can read out or paste to an administrator: the error code, the server's reason if
 * it gave one, and the time (UTC). It contains no personal data, and the time lets the logs be searched.
 */
export function diagnosticReference(error: unknown, now: Date = new Date()): string {
  const code = codeOf(error) || 'unknown';
  const { reason } = detailsOf(error);
  return `${code}${reason === '' ? '' : ` / ${reason}`} @ ${now.toISOString()}`;
}
