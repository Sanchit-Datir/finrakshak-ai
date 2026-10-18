import { describe, expect, it } from 'vitest';
import { assessPixels } from './image-quality.js';

function img(w: number, h: number, f: (x: number, y: number) => number): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y);
  return g;
}

describe('assessPixels', () => {
  it('flags dark, flat, low-resolution images', () => {
    const r = assessPixels(
      img(50, 50, () => 20),
      50,
      50,
      400,
      300,
    );
    expect(r.warnings.join(' ')).toMatch(/dark/);
    expect(r.warnings.join(' ')).toMatch(/blurry/);
    expect(r.warnings.join(' ')).toMatch(/Low resolution/);
  });
  it('accepts a bright, high-contrast, high-resolution page', () => {
    const r = assessPixels(
      img(80, 80, (x, y) => ((x + y) % 2 === 0 ? 240 : 60)),
      80,
      80,
      2400,
      3200,
    );
    expect(r.warnings).toEqual([]);
  });
});
