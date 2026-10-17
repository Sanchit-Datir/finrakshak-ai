import { describe, expect, it } from 'vitest';
import { describeError } from './log.js';

describe('describeError', () => {
  it('keeps the type, the numeric code and the start of the message', () => {
    const error = Object.assign(
      new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.'),
      {
        code: 7,
      },
    );
    expect(describeError(error)).toEqual({
      errorName: 'Error',
      errorCode: 7,
      errorMessage: '7 PERMISSION_DENIED: Missing or insufficient permissions.',
    });
  });

  it('truncates a long message so a log line stays small', () => {
    expect(describeError(new Error('x'.repeat(500))).errorMessage).toHaveLength(200);
  });

  it('copes with things that are not errors', () => {
    expect(describeError('boom')).toMatchObject({ errorName: 'string', errorCode: null });
    expect(describeError(null)).toMatchObject({ errorCode: null });
    expect(describeError({ code: { nested: true } }).errorCode).toBeNull();
  });
});
