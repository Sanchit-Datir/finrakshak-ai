import {
  Activity,
  BellRing,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  FileStack,
  Files,
  Gauge,
  Inbox,
  Landmark,
  LayoutDashboard,
  Network,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { CountKey } from '../../lib/nav-counts.js';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Small honesty tag for prototype pages, e.g. "Synth" or "Beta". */
  tag?: string;
  /** Live count shown next to the label (see lib/nav-counts.ts). */
  count?: CountKey;
  /** Keyboard shortcut after pressing G, e.g. "d" for G then D. */
  key?: string;
}

/** The three steps of the loan journey; each has its own colour in the sidebar and page headers. */
export type Stage = 'pre' | 'post' | 'investigate';

export interface NavSection {
  id: string;
  label: string;
  /** One-line purpose, shown in page headers ("Assess before you lend"). */
  hint: string;
  /** Journey step number and colour; workspace and insights sections have none. */
  stage?: { n: 1 | 2 | 3; kind: Stage };
  /** No heading in the sidebar or page header: the section is a single, self-explaining link. */
  bare?: boolean;
  items: NavItem[];
}

/** Sidebar grouped by the loan journey: pre-sanction → ₹ disbursed → post-disbursement → investigate. */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    hint: 'Your day at a glance',
    items: [
      { to: '/dashboard', label: 'Command center', icon: LayoutDashboard, key: 'd' },
      { to: '/queue', label: 'My queue', icon: Inbox, count: 'queue', key: 'q' },
    ],
  },
  {
    id: 'pre',
    label: 'Pre-sanction',
    hint: 'Assess before you lend',
    stage: { n: 1, kind: 'pre' },
    items: [
      {
        to: '/applications',
        label: 'Applications',
        icon: FileStack,
        count: 'applications',
        key: 'a',
      },
      { to: '/borrowers', label: 'Borrowers', icon: Users, key: 'b' },
      { to: '/documents', label: 'Documents', icon: Files, key: 'f' },
    ],
  },
  {
    id: 'post',
    label: 'Post-disbursement',
    hint: 'Watch after you lend',
    stage: { n: 2, kind: 'post' },
    items: [
      { to: '/monitoring', label: 'Loan book', icon: Activity, count: 'loans', key: 'm' },
      {
        to: '/monitoring/public-records',
        label: 'Public records',
        icon: Landmark,
        count: 'publicNew',
        key: 'p',
      },
      { to: '/monitoring/risk-scores', label: 'Risk scores', icon: Gauge, tag: 'Synth', key: 's' },
    ],
  },
  {
    id: 'investigate',
    label: 'Investigate',
    hint: 'Follow the leads',
    stage: { n: 3, kind: 'investigate' },
    items: [
      { to: '/investigations', label: 'Cases', icon: BriefcaseBusiness, count: 'cases', key: 'c' },
      { to: '/graph-lab', label: 'Relationship graph', icon: Network, tag: 'Beta', key: 'g' },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts',
    hint: 'Leads from every stage of the loan',
    bare: true,
    items: [{ to: '/alerts', label: 'Alerts', icon: BellRing, count: 'alerts', key: 'l' }],
  },
  {
    id: 'insights',
    label: 'Insights',
    hint: 'Portfolio reporting',
    items: [{ to: '/reports', label: 'Reports', icon: ChartNoAxesCombined, key: 'r' }],
  },
];

export const SETTINGS_NAV: NavItem = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  key: ',',
};

export const ALL_NAV: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), SETTINGS_NAV];

/** Longest-prefix match so /monitoring/risk-scores does not also light up /monitoring. */
export function activeNavPath(pathname: string): string | null {
  const hits = ALL_NAV.filter((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return hits.sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null;
}

/** The sidebar section that owns a path, for the stage label in page headers. */
export function sectionFor(pathname: string): NavSection | null {
  const to = activeNavPath(pathname);
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.to === to)) ?? null;
}
