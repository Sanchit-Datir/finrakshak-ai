import { ExternalLink, FileSearch } from 'lucide-react';
import { safeExternalUrl } from '../../lib/safe-url.js';
import { Link } from 'react-router';
import type { EvidenceRef } from '../../lib/checks.js';

export function EvidenceList({
  evidence,
  onOpen,
}: {
  evidence: EvidenceRef[];
  onOpen: (e: EvidenceRef) => void;
}): React.JSX.Element {
  return (
    <ul className="space-y-2">
      {evidence.map((e, i) => (
        <li key={`${e.label}-${i}`} className="border-line rounded-lg border p-2.5 text-sm">
          <p className="text-muted text-xs">{e.label}</p>
          <p className="mt-0.5 font-medium break-words" lang="mr">
            {e.value || '—'}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            {e.docId !== null && (
              <button
                type="button"
                className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                onClick={() => {
                  onOpen(e);
                }}
              >
                <FileSearch className="size-3.5" aria-hidden /> Open source
              </button>
            )}
            {e.appId !== null && (
              <Link
                className="text-primary font-semibold hover:underline"
                to={`/applications/${e.appId}`}
              >
                Open application {e.appId}
              </Link>
            )}
            {safeExternalUrl(e.url) !== null && (
              <a
                href={safeExternalUrl(e.url) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
              >
                <ExternalLink className="size-3.5" aria-hidden /> Open public record
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
