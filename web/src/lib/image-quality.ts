/**
 * Lightweight, local image-quality checks for captured pages (spec §7: warn
 * about blurry, dark or low-resolution images). These are heuristics computed
 * in the browser — not OCR and not an authenticity check.
 */

export interface QualityReport {
  width: number;
  height: number;
  brightness: number; // 0..1
  sharpness: number; // Laplacian variance on a downscaled grayscale copy
  warnings: string[];
}

const SAMPLE = 320;

export function assessPixels(
  gray: Float32Array,
  w: number,
  h: number,
  srcW: number,
  srcH: number,
): QualityReport {
  let sum = 0;
  for (const v of gray) sum += v;
  const brightness = gray.length === 0 ? 0 : sum / gray.length / 255;
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * (gray[i] ?? 0) -
        (gray[i - 1] ?? 0) -
        (gray[i + 1] ?? 0) -
        (gray[i - w] ?? 0) -
        (gray[i + w] ?? 0);
      lapSum += lap;
      lapSq += lap * lap;
      n += 1;
    }
  }
  const mean = n === 0 ? 0 : lapSum / n;
  const sharpness = n === 0 ? 0 : lapSq / n - mean * mean;
  const warnings: string[] = [];
  if (Math.min(srcW, srcH) < 900)
    warnings.push(
      `Low resolution (${srcW}×${srcH}px). Small text may be unreadable; scan at a higher resolution if possible.`,
    );
  if (brightness < 0.28)
    warnings.push(
      `Image appears dark (average brightness ${Math.round(brightness * 100)}%). Retake in better light.`,
    );
  if (brightness > 0.97) warnings.push('Image appears washed out or mostly blank.');
  if (sharpness < 60)
    warnings.push('Image may be blurry. Hold the camera steady and retake if text is unclear.');
  return { width: srcW, height: srcH, brightness, sharpness, warnings };
}

export async function assessImage(file: Blob): Promise<QualityReport> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SAMPLE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('Canvas not available');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    gray[i] =
      0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0);
  }
  const report = assessPixels(gray, w, h, bitmap.width, bitmap.height);
  bitmap.close();
  return report;
}
