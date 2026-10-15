import { FileText, FileX2 } from 'lucide-react';
import type { FtDocument } from '../../domain/schemas.js';
import { getSample } from '../../demo/samples.js';
import { getLocalFile } from '../../state/files.js';
import { SyntheticPage } from './SyntheticPage.js';

export function DocThumb({
  doc,
  className = 'h-[72px] w-14',
}: {
  doc: FtDocument;
  className?: string;
}): React.JSX.Element {
  const sample = getSample(doc.sampleId);
  const local = getLocalFile(doc.id);
  const rot = doc.pages[0]?.rotation ?? 0;
  let inner: React.JSX.Element;
  if (sample !== undefined) inner = <SyntheticPage sample={sample} highlight={null} label="" />;
  else if (local !== undefined && doc.mimeType.startsWith('image/'))
    inner = <img src={local.url} alt="" className="size-full object-cover" />;
  else if (doc.processing === 'failed')
    inner = <FileX2 className="text-danger size-6" aria-hidden />;
  else inner = <FileText className="text-muted size-6" aria-hidden />;
  return (
    <div
      aria-hidden
      className={`border-line bg-surface-2 flex shrink-0 items-center justify-center overflow-hidden rounded-md border ${className}`}
    >
      <div
        className="flex size-full items-center justify-center"
        style={{ transform: `rotate(${rot}deg)` }}
      >
        {inner}
      </div>
    </div>
  );
}
