import type { Db } from '../../domain/schemas.js';
import { allAlerts } from '../../lib/alerts.js';
import { docTypeLabel } from '../../lib/doc-catalog.js';
import { matchesQuery } from '../../lib/text.js';
import { ALL_NAV } from '../app-shell/nav.js';

export type CommandGroup =
  | 'Recent'
  | 'Actions'
  | 'Go to'
  | 'Borrowers'
  | 'Applications'
  | 'Loans'
  | 'Alerts'
  | 'Cases'
  | 'Documents'
  | 'Entities';

export type CommandAction = 'new-application' | 'toggle-theme' | 'shortcuts';

export interface Command {
  id: string;
  group: CommandGroup;
  title: string;
  detail: string;
  /** Either a route to open or an action to run. */
  href?: string;
  action?: CommandAction;
  hint?: string;
}

const PER_GROUP = 5;

const ACTIONS: Command[] = [
  {
    id: 'act-new',
    group: 'Actions',
    title: 'Start a new loan application',
    detail: 'Form first, documents optional',
    action: 'new-application',
    hint: 'N',
  },
  {
    id: 'act-urgent',
    group: 'Actions',
    title: 'Review urgent alerts',
    detail: 'Alerts at Urgent review',
    href: '/alerts?priority=urgent',
  },
  {
    id: 'act-import',
    group: 'Actions',
    title: 'Import a transaction file',
    detail: 'Post-disbursement monitoring',
    href: '/monitoring',
  },
  {
    id: 'act-theme',
    group: 'Actions',
    title: 'Toggle dark mode',
    detail: 'Switch between light and dark',
    action: 'toggle-theme',
  },
  {
    id: 'act-keys',
    group: 'Actions',
    title: 'Keyboard shortcuts',
    detail: 'See every shortcut',
    action: 'shortcuts',
    hint: '?',
  },
];

function pages(): Command[] {
  return ALL_NAV.map((n) => ({
    id: `page-${n.to}`,
    group: 'Go to' as const,
    title: n.label,
    detail: n.to,
    href: n.to,
    ...(n.key === undefined ? {} : { hint: `G ${n.key.toUpperCase()}` }),
  }));
}

function records(db: Db, q: string): Command[] {
  const take = <T>(xs: T[]): T[] => xs.slice(0, PER_GROUP);
  const appName = (a: Db['applications'][number]): string =>
    a.data.business.businessName || a.data.applicant.fullName || 'Untitled application';
  return [
    ...take(db.borrowers.filter((b) => matchesQuery(q, b.name, b.nameOriginal, b.id))).map((b) => ({
      id: b.id,
      group: 'Borrowers' as const,
      title: b.name,
      detail: `${b.id} · ${b.nameOriginal}`,
      href: `/borrowers/${b.id}`,
    })),
    ...take(
      db.applications.filter((a) => matchesQuery(q, a.id, appName(a), a.data.loan.purpose)),
    ).map((a) => ({
      id: a.id,
      group: 'Applications' as const,
      title: `${a.id} · ${appName(a)}`,
      detail: a.data.loan.purpose || a.status.replace(/_/g, ' '),
      href: `/applications/${a.id}`,
    })),
    ...take(db.loans.filter((l) => matchesQuery(q, l.id, l.purpose))).map((l) => ({
      id: l.id,
      group: 'Loans' as const,
      title: l.id,
      detail: l.purpose,
      href: `/monitoring?loan=${encodeURIComponent(l.id)}`,
    })),
    ...take(allAlerts(db).filter((a) => matchesQuery(q, a.id, a.title, a.linkedLabel))).map(
      (a) => ({
        id: a.id,
        group: 'Alerts' as const,
        title: a.title,
        detail: a.linkedLabel,
        href: `/alerts?alert=${encodeURIComponent(a.id)}`,
      }),
    ),
    ...take(db.cases.filter((c) => matchesQuery(q, c.id, c.title))).map((c) => ({
      id: c.id,
      group: 'Cases' as const,
      title: `${c.id} · ${c.title}`,
      detail: c.status.replace(/_/g, ' '),
      href: `/investigations/${c.id}`,
    })),
    ...take(
      db.documents.filter((d) => matchesQuery(q, d.filename, d.id, docTypeLabel(d.docType))),
    ).map((d) => ({
      id: d.id,
      group: 'Documents' as const,
      title: d.filename,
      detail: `${docTypeLabel(d.docType)} · ${d.applicationId ?? 'Unlinked'}`,
      href: `/documents?doc=${d.id}`,
    })),
    ...take(
      db.entities.filter(
        (e) =>
          (e.kind === 'company' || e.kind === 'individual') &&
          e.borrowerId === null &&
          matchesQuery(q, e.name),
      ),
    ).map((e) => ({
      id: e.id,
      group: 'Entities' as const,
      title: e.name,
      detail: e.subtitle,
      href: `/investigations?q=${encodeURIComponent(e.name)}`,
    })),
  ];
}

/** Everything the palette can show for a query; empty query shows recents, actions and pages. */
export function searchCommands(db: Db, query: string, recent: Command[]): Command[] {
  const q = query.trim();
  if (q === '') return [...recent, ...ACTIONS, ...pages()];
  const fixed = [...ACTIONS, ...pages()].filter((c) => matchesQuery(q, c.title, c.detail));
  return q.length < 2 ? fixed : [...fixed, ...records(db, q)];
}
