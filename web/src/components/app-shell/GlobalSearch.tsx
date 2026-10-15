import { Briefcase, Building2, FileText, Files, Search, Users } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { docTypeLabel } from '../../lib/doc-catalog.js';
import { matchesQuery } from '../../lib/text.js';
import { useDb } from '../../state/store.js';
import { cn } from '../ui/cn.js';

interface Result {
  id: string;
  group: 'Borrowers' | 'Loan Applications' | 'Companies / Entities' | 'Documents' | 'Cases';
  title: string;
  detail: string;
  href: string;
}

const GROUP_ICON = {
  Borrowers: Users,
  'Loan Applications': FileText,
  'Companies / Entities': Building2,
  Documents: Files,
  Cases: Briefcase,
} as const;
const PER_GROUP = 4;

export function GlobalSearch({ className }: { className?: string }): React.JSX.Element {
  const db = useDb();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<Result[]>(() => {
    if (query.trim().length < 2) return [];
    const take = <T,>(xs: T[]): T[] => xs.slice(0, PER_GROUP);
    return [
      ...take(
        db.borrowers.filter((b) =>
          matchesQuery(query, b.name, b.nameOriginal, b.id, b.maskedIdentifier),
        ),
      ).map((b) => ({
        id: b.id,
        group: 'Borrowers' as const,
        title: b.name,
        detail: `${b.id} · ${b.nameOriginal}`,
        href: `/borrowers/${b.id}`,
      })),
      ...take(
        db.applications.filter((a) =>
          matchesQuery(
            query,
            a.id,
            a.data.applicant.fullName,
            a.data.business.businessName,
            a.data.loan.purpose,
          ),
        ),
      ).map((a) => ({
        id: a.id,
        group: 'Loan Applications' as const,
        title: `${a.id} — ${a.data.business.businessName || a.data.applicant.fullName || 'Untitled'}`,
        detail: a.data.loan.purpose || a.status,
        href: `/applications/${a.id}`,
      })),
      ...take(db.loans.filter((l) => matchesQuery(query, l.id, l.purpose))).map((l) => ({
        id: l.id,
        group: 'Loan Applications' as const,
        title: `${l.id} (disbursed loan)`,
        detail: l.purpose,
        href: `/monitoring?loan=${encodeURIComponent(l.id)}`,
      })),
      ...take(
        db.entities.filter(
          (e) =>
            (e.kind === 'company' || e.kind === 'individual') &&
            e.borrowerId === null &&
            matchesQuery(query, e.name),
        ),
      ).map((e) => ({
        id: e.id,
        group: 'Companies / Entities' as const,
        title: e.name,
        detail: e.subtitle,
        href: `/investigations?q=${encodeURIComponent(e.name)}`,
      })),
      ...take(
        db.documents.filter((d) => matchesQuery(query, d.filename, d.id, docTypeLabel(d.docType))),
      ).map((d) => ({
        id: d.id,
        group: 'Documents' as const,
        title: d.filename,
        detail: `${docTypeLabel(d.docType)} · ${d.applicationId ?? 'Unlinked'}`,
        href: `/documents?doc=${d.id}`,
      })),
      ...take(db.cases.filter((c) => matchesQuery(query, c.id, c.title))).map((c) => ({
        id: c.id,
        group: 'Cases' as const,
        title: `${c.id} — ${c.title}`,
        detail: c.status.replace(/_/g, ' '),
        href: `/investigations/${c.id}`,
      })),
    ];
  }, [db, query]);

  const go = (r: Result | undefined): void => {
    if (r === undefined) return;
    setOpen(false);
    setQ('');
    void navigate(r.href);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && query.trim().length >= 2;
  const groups = [...new Set(results.map((r) => r.group))];

  return (
    <div className={cn('relative', className)}>
      <Search
        className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Global search"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showPanel && results[active] !== undefined ? `${listId}-${active}` : undefined
        }
        placeholder="Search borrower, loan ID, company, document..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
        onKeyDown={onKey}
        className="border-line bg-surface-2 focus:bg-surface focus:border-primary focus:ring-primary/20 h-10 w-full rounded-lg border pr-3 pl-9 text-sm outline-none focus:ring-2"
      />
      {showPanel && (
        <div
          className="card absolute top-full right-0 left-0 z-50 mt-2 max-h-[70vh] overflow-y-auto py-1"
          style={{ boxShadow: 'var(--shadow-pop)' }}
        >
          {results.length === 0 ? (
            <p className="text-muted px-4 py-6 text-center text-sm">
              No matches for “{query}”. Try a name, loan ID or document file name.
            </p>
          ) : (
            <div id={listId} role="listbox" aria-label="Search results">
              {groups.map((g) => {
                const Icon = GROUP_ICON[g];
                return (
                  <div key={g} role="group" aria-label={g}>
                    <p
                      aria-hidden
                      className="text-muted flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide uppercase"
                    >
                      <Icon className="size-3.5" /> {g}
                    </p>
                    {results.map((r, i) =>
                      r.group !== g ? null : (
                        <div
                          key={`${r.group}-${r.id}`}
                          id={`${listId}-${i}`}
                          role="option"
                          tabIndex={-1}
                          aria-selected={i === active}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            go(r);
                          }}
                          onMouseEnter={() => {
                            setActive(i);
                          }}
                          className={cn(
                            'cursor-pointer px-4 py-2',
                            i === active && 'bg-primary-soft',
                          )}
                        >
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="text-muted truncate text-xs">{r.detail}</p>
                        </div>
                      ),
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
