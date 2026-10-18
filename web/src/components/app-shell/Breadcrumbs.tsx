import { ChevronRight, House } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import type { Db } from '../../domain/schemas.js';
import { useDb } from '../../state/store.js';

interface Crumb {
  label: string;
  to: string;
}

const SECTION: Record<string, string> = {
  applications: 'Applications',
  borrowers: 'Borrowers',
  investigations: 'Cases',
  monitoring: 'Loan book',
  'public-records': 'Public records watch',
  'risk-scores': 'Risk scores',
  new: 'New application',
  edit: 'Edit',
};

function recordLabel(db: Db, section: string, id: string): string {
  if (section === 'applications') {
    const a = db.applications.find((x) => x.id === id);
    if (a === undefined) return id;
    const name =
      a.data.business.businessName === ''
        ? a.data.applicant.fullName
        : a.data.business.businessName;
    return name === '' ? id : `${id} · ${name}`;
  }
  if (section === 'borrowers') return db.borrowers.find((b) => b.id === id)?.name ?? id;
  return id;
}

function crumbsFor(db: Db, pathname: string): Crumb[] {
  const parts = pathname.split('/').filter((p) => p !== '');
  const section = parts[0] ?? '';
  return parts.map((p, i) => {
    const to = `/${parts.slice(0, i + 1).join('/')}`;
    const label = SECTION[p] ?? recordLabel(db, section, decodeURIComponent(p));
    return { label, to };
  });
}

/** Trail shown on nested pages only (e.g. Applications › A-1002 · Sunita Pawar). */
export function Breadcrumbs(): React.JSX.Element | null {
  const db = useDb();
  const { pathname } = useLocation();
  const crumbs = crumbsFor(db, pathname);
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="text-muted flex flex-wrap items-center gap-1 text-[13px]">
        <li>
          <Link to="/dashboard" className="hover:text-primary flex items-center" title="Dashboard">
            <House className="size-3.5" aria-hidden />
            <span className="sr-only">Dashboard</span>
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 opacity-60" aria-hidden />
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="text-ink max-w-[40ch] truncate font-medium">
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="hover:text-primary max-w-[30ch] truncate">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
