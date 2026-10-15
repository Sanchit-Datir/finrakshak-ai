/**
 * Lazy pdf.js wrapper for page counts and page previews of user-selected PDFs.
 * Runs locally in the browser; no file leaves the device.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

let lib: Promise<typeof import('pdfjs-dist')> | null = null;

async function load(): Promise<typeof import('pdfjs-dist')> {
  lib ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return lib;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export async function openPdf(key: string, file: Blob): Promise<PDFDocumentProxy> {
  let p = docs.get(key);
  if (p === undefined) {
    p = (async () => {
      const pdfjs = await load();
      const data = new Uint8Array(await file.arrayBuffer());
      return pdfjs.getDocument({ data }).promise;
    })();
    docs.set(key, p);
    p.catch(() => docs.delete(key));
  }
  return p;
}

export async function renderPdfPage(key: string, file: Blob, pageIndex: number, canvas: HTMLCanvasElement, width: number): Promise<void> {
  const pdf = await openPdf(key, file);
  const page = await pdf.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width * (window.devicePixelRatio || 1)) / base.width });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
}

export function forgetPdf(key: string): void {
  void docs.get(key)?.then((d) => d.loadingTask.destroy()).catch(() => undefined);
  docs.delete(key);
}
