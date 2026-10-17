import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/app-shell/AppShell.js';
import { ToastProvider } from './state/toast.js';

// Route-level code splitting: each page loads on demand with a skeleton fallback.
const named = <K extends string>(
  loader: () => Promise<Record<K, React.ComponentType>>,
  key: K,
): React.LazyExoticComponent<React.ComponentType> =>
  lazy(async () => ({ default: (await loader())[key] }));

const LoginPage = named(() => import('./pages/LoginPage.js'), 'LoginPage');
const DashboardPage = named(() => import('./pages/DashboardPage.js'), 'DashboardPage');
const ApplicationsPage = named(() => import('./pages/ApplicationsPage.js'), 'ApplicationsPage');
const NewApplicationPage = named(
  () => import('./pages/NewApplicationPage.js'),
  'NewApplicationPage',
);
const ApplicationDetailPage = named(
  () => import('./pages/ApplicationDetailPage.js'),
  'ApplicationDetailPage',
);
const DocumentsPage = named(() => import('./pages/DocumentsPage.js'), 'DocumentsPage');
const BorrowersPage = named(() => import('./pages/BorrowersPage.js'), 'BorrowersPage');
const BorrowerProfilePage = named(
  () => import('./pages/BorrowerProfilePage.js'),
  'BorrowerProfilePage',
);
const MonitoringPage = named(() => import('./pages/MonitoringPage.js'), 'MonitoringPage');
const RiskScoresPage = named(() => import('./pages/RiskScoresPage.js'), 'RiskScoresPage');
const PublicRecordsWatchPage = named(
  () => import('./pages/PublicRecordsWatchPage.js'),
  'PublicRecordsWatchPage',
);
const InvestigationsPage = named(
  () => import('./pages/InvestigationsPage.js'),
  'InvestigationsPage',
);
const CaseDetailPage = named(() => import('./pages/CaseDetailPage.js'), 'CaseDetailPage');
const ReportsPage = named(() => import('./pages/ReportsPage.js'), 'ReportsPage');
const AlertsPage = named(() => import('./pages/AlertsPage.js'), 'AlertsPage');
const SettingsPage = named(() => import('./pages/SettingsPage.js'), 'SettingsPage');
const HelpPage = named(() => import('./pages/HelpPage.js'), 'HelpPage');
const GraphLabPage = named(() => import('./pages/GraphLabPage.js'), 'GraphLabPage');
const NotFoundPage = named(() => import('./pages/NotFoundPage.js'), 'NotFoundPage');

export function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/applications/new" element={<NewApplicationPage />} />
            <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
            <Route path="/applications/:applicationId/edit" element={<NewApplicationPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/borrowers" element={<BorrowersPage />} />
            <Route path="/borrowers/:borrowerId" element={<BorrowerProfilePage />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="/monitoring/public-records" element={<PublicRecordsWatchPage />} />
            <Route path="/monitoring/risk-scores" element={<RiskScoresPage />} />
            <Route path="/investigations" element={<InvestigationsPage />} />
            <Route path="/investigations/:caseId" element={<CaseDetailPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/graph-lab" element={<GraphLabPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
