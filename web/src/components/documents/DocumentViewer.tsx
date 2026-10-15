import {
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Maximize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FtDocument, Region } from '../../domain/schemas.js';
import { getSample } from '../../demo/samples.js';
import { docTypeLabel } from '../../lib/doc-catalog.js';
import { renderPdfPage } from '../../lib/pdf.js';
import { getLocalFile } from '../../state/files.js';
import { IconButton } from '../ui/Button.js';
import { EmptyState, ErrorState, Skeleton } from '../ui/States.js';
import { SyntheticPage } from './SyntheticPage.js';

function PdfCanvas({
  doc,
  page,
  width,
}: {
  doc: FtDocument;
  page: number;
  width: number;
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const local = getLocalFile(doc.id);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null || local === undefined) return;
    let cancelled = false;
    setState('loading');
    renderPdfPage(doc.id, local.file, page, canvas, width)
      .then(() => {
        if (!cancelled) setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id, local, page, width]);
  if (state === 'error')
    return (
      <ErrorState title="Couldn't display this PDF page">
        The file may be damaged or password-protected. Try re-uploading a different copy.
      </ErrorState>
    );
  return (
    <>
      {state === 'loading' && <Skeleton className="aspect-[3/4] w-full" />}
      <canvas
        ref={ref}
        className={state === 'ready' ? 'block h-auto w-full' : 'hidden'}
        aria-label={`${doc.filename}, page ${page + 1}`}
      />
    </>
  );
}

/**
 * Document viewer with zoom, rotate and page navigation. Shows synthetic demo
 * pages with a highlighted source region, or the user's local file.
 */
export function DocumentViewer({
  doc,
  highlight,
  onRotate,
  compact = false,
}: {
  doc: FtDocument;
  highlight?: Region | null;
  onRotate?: (pageIndex: number) => void;
  compact?: boolean;
}): React.JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, doc.pages.length);
  const current = Math.min(page, pageCount - 1);
  const rotation = doc.pages[current]?.rotation ?? 0;
  const sample = getSample(doc.sampleId);
  const local = getLocalFile(doc.id);
  const isPdf = doc.mimeType === 'application/pdf';
  const label = `${docTypeLabel(doc.docType)} — ${doc.filename}, page ${current + 1} of ${pageCount}`;

  let body: React.JSX.Element;
  if (sample !== undefined) {
    body = <SyntheticPage sample={sample} highlight={highlight ?? null} label={label} />;
  } else if (local !== undefined && isPdf) {
    body = <PdfCanvas doc={doc} page={current} width={560} />;
  } else if (local !== undefined) {
    body = <img src={local.url} alt={label} className="block h-auto w-full" />;
  } else {
    body = (
      <EmptyState
        icon={FileQuestion}
        title={
          doc.source === 'demo'
            ? 'No page image in the demo dataset'
            : 'Original file not available'
        }
      >
        {doc.source === 'demo'
          ? 'This synthetic record has metadata only. Samples with page images: 7/12 extracts, Aadhaar (masked), bank statement, handwritten form, warehouse receipts.'
          : 'Files are held only in the browser tab where they were selected (no storage backend is connected). Re-attach the file to view it.'}
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <IconButton
          label="Zoom out"
          icon={ZoomOut}
          onClick={() => {
            setZoom((z) => Math.max(0.5, z - 0.25));
          }}
          disabled={zoom <= 0.5}
        />
        <span className="tabular w-12 text-center text-xs" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton
          label="Zoom in"
          icon={ZoomIn}
          onClick={() => {
            setZoom((z) => Math.min(3, z + 0.25));
          }}
          disabled={zoom >= 3}
        />
        <IconButton
          label="Fit to width"
          icon={Maximize2}
          onClick={() => {
            setZoom(1);
          }}
        />
        {onRotate !== undefined && (
          <IconButton
            label="Rotate page 90°"
            icon={RotateCw}
            onClick={() => {
              onRotate(current);
            }}
          />
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Previous page"
            icon={ChevronLeft}
            disabled={current === 0}
            onClick={() => {
              setPage(current - 1);
            }}
          />
          <span className="tabular text-xs">
            Page {current + 1} / {pageCount}
          </span>
          <IconButton
            label="Next page"
            icon={ChevronRight}
            disabled={current >= pageCount - 1}
            onClick={() => {
              setPage(current + 1);
            }}
          />
        </div>
      </div>
      <div
        className={`bg-neutral-soft min-h-0 flex-1 overflow-auto p-3 ${compact ? 'max-h-[60vh]' : ''}`}
      >
        <div
          className="mx-auto shadow-md transition-transform"
          style={{
            width: `${zoom * 100}%`,
            maxWidth: zoom <= 1 ? 640 : undefined,
            transform: `rotate(${rotation}deg)`,
          }}
        >
          {body}
        </div>
      </div>
      {sample !== undefined && (
        <p className="text-muted border-line border-t px-3 py-1.5 text-[11px]">
          Synthetic sample document — fictional names and numbers.
        </p>
      )}
    </div>
  );
}
