import { addUploadedDocument, updateDocument } from '../state/actions.js';
import { registerFile } from '../state/files.js';
import { assessImage } from './image-quality.js';
import { forgetPdf, openPdf } from './pdf.js';

/**
 * Local intake pipeline for user-selected files. It validates the file, counts
 * PDF pages and runs image-quality heuristics in the browser. Automatic text
 * extraction (OCR / Gemini) is NOT connected, so every upload ends in
 * "Needs review" with manual entry required.
 */

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const MAX_BYTES = 20 * 1024 * 1024;

export const NO_EXTRACTION_NOTE =
  'Automatic text extraction is not connected in this prototype. Enter key fields manually in “Extract & verify”.';

function typeOf(file: File): string {
  if (file.type !== '') return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return ext === 'pdf'
    ? 'application/pdf'
    : ext === 'png'
      ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : '';
}

/** The browser's MIME type, else the file extension, for the unsupported-type message. */
function fileTypeLabel(file: File): string {
  if (file.type !== '') return file.type;
  const ext = file.name.split('.').pop() ?? '';
  return ext === '' ? 'unknown' : ext;
}

export async function processDocumentFile(docId: string, file: File, actor: string): Promise<void> {
  const mime = typeOf(file);
  if (!(ACCEPTED_TYPES as readonly string[]).includes(mime)) {
    updateDocument(
      docId,
      {
        processing: 'failed',
        failureReason: `Unsupported file type (${fileTypeLabel(file)}). Use PDF, JPG or PNG.`,
      },
      actor,
      'Rejected: unsupported type',
    );
    return;
  }
  if (file.size > MAX_BYTES) {
    updateDocument(
      docId,
      {
        processing: 'failed',
        failureReason: 'File is larger than 20 MB. Scan at a lower resolution or split the PDF.',
      },
      actor,
      'Rejected: too large',
    );
    return;
  }
  registerFile(docId, file);
  updateDocument(docId, { processing: 'processing' });
  try {
    if (mime === 'application/pdf') {
      forgetPdf(docId);
      const pdf = await openPdf(docId, file);
      const pages = Array.from({ length: pdf.numPages }, (_, index) => ({
        index,
        rotation: 0 as const,
      }));
      updateDocument(
        docId,
        {
          pages,
          processing: 'needs_review',
          qualityWarnings: [NO_EXTRACTION_NOTE],
          failureReason: null,
        },
        actor,
        `Read locally: ${pdf.numPages} page(s)`,
      );
    } else {
      const q = await assessImage(file);
      updateDocument(
        docId,
        {
          pages: [{ index: 0, rotation: 0 }],
          processing: 'needs_review',
          qualityWarnings: [...q.warnings, NO_EXTRACTION_NOTE],
          failureReason: null,
        },
        actor,
        `Image checked locally (${q.width}×${q.height}px, ${q.warnings.length} warning(s))`,
      );
    }
  } catch {
    updateDocument(
      docId,
      {
        processing: 'failed',
        failureReason:
          mime === 'application/pdf'
            ? 'This PDF could not be read. It may be damaged or password-protected.'
            : 'This image could not be read. It may be damaged or in an unsupported format.',
      },
      actor,
      'Local processing failed',
    );
  }
}

/** Adds files as documents (never silently discarded — rejected files stay listed with a reason). */
export function intakeFiles(
  appId: string | null,
  files: File[],
  source: 'upload' | 'camera',
  actor: string,
): string[] {
  return files.map((file) => {
    const id = addUploadedDocument(appId, file, source, actor);
    void processDocumentFile(id, file, actor);
    return id;
  });
}
