import { addMachineFields, addUploadedDocument, updateDocument } from '../state/actions.js';
import { registerFile } from '../state/files.js';
import { uid } from '../state/store.js';
import { aiConfigured } from './ai/env.js';
import { toExtractionResult } from './ai/extraction.js';
import { assessImage } from './image-quality.js';
import { forgetPdf, openPdf } from './pdf.js';

/**
 * Intake pipeline for user-selected files. It validates the file, counts PDF
 * pages and runs image-quality heuristics in the browser, then — when Firebase
 * is configured — asks Gemini (Firebase AI Logic) to read the fields. Without
 * that config every upload ends in "Needs review" with manual entry required.
 */

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const MAX_BYTES = 20 * 1024 * 1024;

const MANUAL_ENTRY_NOTE = 'Enter key fields manually in “Extract & verify”.';

export const NO_EXTRACTION_NOTE = `Automatic text extraction is not connected in this prototype. ${MANUAL_ENTRY_NOTE}`;

function typeOf(file: File): string {
  if (file.type !== '') return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : '';
}

export async function processDocumentFile(docId: string, file: File, actor: string): Promise<void> {
  const mime = typeOf(file);
  if (!(ACCEPTED_TYPES as readonly string[]).includes(mime)) {
    updateDocument(docId, { processing: 'failed', failureReason: `Unsupported file type (${file.type || file.name.split('.').pop() || 'unknown'}). Use PDF, JPG or PNG.` }, actor, 'Rejected: unsupported type');
    return;
  }
  if (file.size > MAX_BYTES) {
    updateDocument(docId, { processing: 'failed', failureReason: 'File is larger than 20 MB. Scan at a lower resolution or split the PDF.' }, actor, 'Rejected: too large');
    return;
  }
  registerFile(docId, file);
  updateDocument(docId, { processing: 'processing' });
  let local: { pageCount: number; warnings: string[] };
  try {
    local = await readLocally(docId, file, mime, actor);
  } catch {
    updateDocument(docId, { processing: 'failed', failureReason: mime === 'application/pdf' ? 'This PDF could not be read. It may be damaged or password-protected.' : 'This image could not be read. It may be damaged or in an unsupported format.' }, actor, 'Local processing failed');
    return;
  }
  if (!aiConfigured()) {
    updateDocument(docId, { processing: 'needs_review', qualityWarnings: [...local.warnings, NO_EXTRACTION_NOTE] });
    return;
  }
  await extractFields(docId, file, mime, local, actor);
}

async function readLocally(docId: string, file: File, mime: string, actor: string): Promise<{ pageCount: number; warnings: string[] }> {
  if (mime === 'application/pdf') {
    forgetPdf(docId);
    const pdf = await openPdf(docId, file);
    const pages = Array.from({ length: pdf.numPages }, (_, index) => ({ index, rotation: 0 as const }));
    updateDocument(docId, { pages, failureReason: null }, actor, `Read locally: ${pdf.numPages} page(s)`);
    return { pageCount: pdf.numPages, warnings: [] };
  }
  const q = await assessImage(file);
  updateDocument(docId, { pages: [{ index: 0, rotation: 0 }], failureReason: null }, actor, `Image checked locally (${q.width}×${q.height}px, ${q.warnings.length} warning(s))`);
  return { pageCount: 1, warnings: q.warnings };
}

/** Gemini step. Failures are non-fatal: the document falls back to manual entry. */
async function extractFields(docId: string, file: File, mime: string, local: { pageCount: number; warnings: string[] }, actor: string): Promise<void> {
  try {
    const { extractWithGemini } = await import('./ai/gemini.js');
    const out = await extractWithGemini(file, mime, null);
    const result = toExtractionResult(docId, out, local.pageCount, uid);
    addMachineFields(docId, actor, result);
    const note = result.fields.length === 0 ? [`Gemini found no readable fields. ${MANUAL_ENTRY_NOTE}`] : [];
    updateDocument(docId, { processing: 'needs_review', qualityWarnings: [...local.warnings, ...note] });
  } catch (e) {
    const reason = e instanceof Error && e.name === 'ExtractionError' ? e.message : 'Automatic extraction failed.';
    updateDocument(docId, { processing: 'needs_review', qualityWarnings: [...local.warnings, `${reason} ${MANUAL_ENTRY_NOTE}`] }, actor, 'Gemini extraction failed');
  }
}

/** Adds files as documents (never silently discarded — rejected files stay listed with a reason). */
export function intakeFiles(appId: string | null, files: File[], source: 'upload' | 'camera', actor: string): string[] {
  return files.map((file) => {
    const id = addUploadedDocument(appId, file, source, actor);
    void processDocumentFile(id, file, actor);
    return id;
  });
}
