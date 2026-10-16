import {
  Activity,
  Bell,
  ChartNoAxesCombined,
  FilePlus2,
  Files,
  LayoutDashboard,
  Network,
  SearchCheck,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/applications/new', label: 'New Loan Application', icon: FilePlus2 },
  { to: '/documents', label: 'Document Library', icon: Files },
  { to: '/borrowers', label: 'Borrowers', icon: Users },
  { to: '/monitoring', label: 'Post-disbursement Monitoring', icon: Activity },
  { to: '/investigations', label: 'Investigations', icon: SearchCheck },
  { to: '/graph-lab', label: 'Graph Lab (prototype)', icon: Network },
];

export const REPORTS_GROUP: { label: string; icon: LucideIcon; items: NavItem[] } = {
  label: 'Reports & Alerts',
  icon: ChartNoAxesCombined,
  items: [
    { to: '/reports', label: 'Reports', icon: ChartNoAxesCombined },
    { to: '/alerts', label: 'Alerts', icon: Bell },
  ],
};

export const SETTINGS_NAV: NavItem = { to: '/settings', label: 'Settings', icon: Settings };
