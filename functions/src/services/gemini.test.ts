import { describe, expect, it } from 'vitest';
import { generateText, GeminiError } from './gemini.js';

describe('generateText input bounds', () => {
  it('rejects empty prompt', async () => {
    await expect(generateText('   ')).rejects.toBeInstanceOf(GeminiError);
  });
  it('rejects oversized prompt', async () => {
    await expect(generateText('a'.repeat(8_001))).rejects.toBeInstanceOf(GeminiError);
  });
});
