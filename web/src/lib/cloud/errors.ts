function codeOf(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = error.code;
  return typeof code === 'string' ? code : '';
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
    case 'functions/resource-exhausted':
      return 'You have used today’s AI allowance. It resets at midnight India time.';
    case 'functions/invalid-argument':
      return 'The question is empty or too long.';
    case 'functions/deadline-exceeded':
      return 'The AI took too long to answer. Try a shorter question.';
    default:
      return 'Something went wrong. Try again.';
  }
}
