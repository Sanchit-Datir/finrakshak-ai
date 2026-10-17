import { createHash } from 'node:crypto';

/** Lowercase hex sha256, for the shared functions that take a hash as a parameter. */
export const sha256Hex = (input: string): string =>
  createHash('sha256').update(input).digest('hex');
