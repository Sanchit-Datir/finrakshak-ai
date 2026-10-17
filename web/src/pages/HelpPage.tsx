import { BookOpen, FlaskConical } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';

const WALKTHROUGH: [string, string][] = [
  ['Open a new application', '/applications/new'],
  ['Fill the application form, or upload documents to extract their details', '/applications/new'],
  [
    'Review extracted fields against the highlighted source region; correct and confirm them',
    '/applications/A-1002?tab=documents',
  ],
  [
    'Run the configured checks and open a finding to see its evidence',
    '/applications/A-1003?tab=findings',
  ],
  [
    'Open monitoring for a loan and inspect the flow and transactions',
    '/monitoring?loan=L-2026-0110',
  ],
  ['View the relationship graph for a borrower', '/borrowers/b-omsai?tab=entities'],
  ['Open an alert and add an investigation note', '/alerts'],
  ['Review a case with evidence, statuses and audit trail', '/investigations/CASE-2026-014'],
  ['View the monthly report and export CSV', '/reports'],
];

const STATUS: [string, string][] = [
  [
    'Simulated / connected',
    'Deterministic checks and monitoring rules run for real in your browser. OCR, translation and Gemini analysis are NOT connected — sample documents show labelled simulated output; uploads require manual entry.',
  ],
  ['Sign-in', 'Quick sign-in only. No password is checked and roles are not enforced on a server.'],
  [
    'Storage',
    'Records are stored in this browser (localStorage). Uploaded files stay in the open tab only.',
  ],
];

export function HelpPage(): React.JSX.Element {
  return (
    <>
      <PageHeader
        docTitle="Help"
        title="Help & Support"
        subtitle="How this prototype works and what is (and isn’t) connected."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <BookOpen className="text-primary size-5" aria-hidden /> Walkthrough
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {WALKTHROUGH.map(([t, href]) => (
              <li key={t}>
                <Link className="text-primary hover:underline" to={href}>
                  {t}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <FlaskConical className="text-violet size-5" aria-hidden /> What is real in this
            prototype
          </h2>
          <dl className="space-y-3 text-sm">
            {STATUS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
