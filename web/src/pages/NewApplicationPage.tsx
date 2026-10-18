import { FileQuestion } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CaptureStep } from '../components/applications/CaptureStep.js';
import { ExtractStep } from '../components/applications/ExtractStep.js';
import { ReviewStep } from '../components/applications/ReviewStep.js';
import { RiskStep } from '../components/applications/RiskStep.js';
import { StepNav } from '../components/applications/StepNav.js';
import { pathSteps, Stepper, type CapturePath } from '../components/applications/Stepper.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, Notice } from '../components/ui/States.js';
import { AppStatusBadge } from '../components/ui/StatusBadges.js';
import {
  createDraftApplication,
  saveApplication,
  setStep,
  submitApplication,
  unsavedApplication,
} from '../state/actions.js';
import { useActor } from '../state/hooks.js';
import { useSession } from '../state/session.js';
import type { Application } from '../domain/schemas.js';
import { prefillFromDocuments } from '../lib/prefill.js';
import { getDb, useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';

export function NewApplicationPage(): React.JSX.Element {
  const { applicationId } = useParams();
  const db = useDb();
  const actor = useActor();
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const app =
    applicationId === undefined
      ? null
      : (db.applications.find((a) => a.id === applicationId) ?? null);
  const [localStep, setLocalStep] = useState<number | null>(null);
  const [choice, setChoice] = useState<CapturePath | null>(null);
  // The draft this page created: its edit URL keeps the form mounted with what was typed.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [seenId, setSeenId] = useState(applicationId);
  if (seenId !== applicationId) {
    setSeenId(applicationId);
    if (applicationId !== createdId) {
      setCreatedId(null);
      setLocalStep(null);
      setChoice(null);
    }
  }
  const defaultBranch = session?.branchId ?? db.branches[0]?.id ?? 'br-shirur';

  if (applicationId !== undefined && app === null) {
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="Application not found"
          action={<LinkButton to="/applications">Back to applications</LinkButton>}
        >
          {applicationId} does not exist in this workspace. It may have been created in a different
          browser.
        </EmptyState>
      </Card>
    );
  }

  const docs =
    app === null ? [] : app.documentIds.flatMap((id) => db.documents.filter((d) => d.id === id));
  const hasDocs = docs.length > 0;
  const path: CapturePath = choice ?? (hasDocs ? 'upload' : 'form');
  const steps = pathSteps(path);
  const requested = localStep ?? app?.step ?? (path === 'form' ? 3 : 1);
  // The form path starts at the form; "Extract & verify" only applies to uploaded documents.
  const step =
    path === 'form' ? Math.max(requested, 3) : requested === 2 && !hasDocs ? 1 : requested;
  const furthest = Math.max(step, app?.step ?? 1);
  // Extract and the optional form need documents on the upload path; risk analysis needs a visit.
  const reachable = steps
    .map((s) => s.step)
    .filter((n) => (n === 4 ? furthest >= 4 : n === 1 || path === 'form' || hasDocs));
  const formKey = app === null || app.id === createdId ? 'new' : app.id;

  /** Creates the draft on first meaningful action, then moves to its edit URL. */
  const ensureApp = (): string => {
    if (app !== null) return app.id;
    const id = createDraftApplication(actor, defaultBranch);
    setCreatedId(id);
    void navigate(`/applications/${id}/edit`, { replace: true });
    return id;
  };

  const go = (n: number, appId?: string): void => {
    const id = appId ?? ensureApp();
    const current = getDb().applications.find((a) => a.id === id);
    if (current !== undefined && n > current.step) setStep(id, n);
    setLocalStep(n);
    window.scrollTo({ top: 0 });
  };

  /** Switches path without creating a draft; uploaded files and saved values are kept. */
  const switchTo = (next: CapturePath): void => {
    setChoice(next);
    setLocalStep(next === 'form' ? 3 : 1);
    window.scrollTo({ top: 0 });
  };

  const saveDraft = (): void => {
    const id = ensureApp();
    saveApplication(id, actor, {});
    toast.push({
      tone: 'success',
      title: 'Draft saved',
      detail: `${id} — uploaded documents and reviewed fields are kept.`,
    });
  };

  /** Upload path: the application is created from the confirmed document fields. */
  const continueFromExtract = (current: Application): void => {
    const { data, changes } = prefillFromDocuments(current.data, docs);
    if (changes.length > 0) {
      saveApplication(
        current.id,
        actor,
        { data },
        `${changes.length} field(s) filled from reviewed document fields`,
      );
    }
    toast.push({
      tone: changes.length > 0 ? 'success' : 'info',
      title:
        changes.length > 0
          ? `${changes.length} field(s) filled from reviewed documents`
          : 'No reviewed document fields to fill the application',
      detail: 'Only confirmed or corrected fields are used. Checks report anything missing.',
    });
    go(4, current.id);
  };

  const pending = docs.reduce(
    (n, d) => n + d.fields.filter((f) => f.state === 'unreviewed').length,
    0,
  );
  const stepLabel = steps.find((s) => s.step === step)?.label ?? '';

  return (
    <>
      <PageHeader
        docTitle={app === null ? 'New application' : `${app.id} · ${stepLabel}`}
        title={app === null ? 'New loan application' : `Application ${app.id}`}
        badge={app === null ? undefined : <AppStatusBadge status={app.status} />}
        subtitle="Fill the application form, or upload documents instead and create the application from them. Then run checks."
      />
      <Stepper steps={steps} current={step} reachable={reachable} onSelect={go} />
      {app !== null && (app.status === 'approved' || app.status === 'declined') && (
        <Notice tone="warn" className="mb-4">
          This application already has a recorded decision. Changes here are recorded in the audit
          history but do not change the decision.
        </Notice>
      )}

      {step === 1 && (
        <>
          <CaptureStep
            app={app}
            docs={docs}
            actor={actor}
            ensureApp={ensureApp}
            onFillForm={() => {
              switchTo('form');
            }}
          />
          <StepNav
            onSave={saveDraft}
            onNext={() => {
              go(2);
            }}
            nextDisabled={!hasDocs}
            nextLabel="Continue to extract & verify"
          />
        </>
      )}
      {step === 2 && app !== null && (
        <>
          <ExtractStep docs={docs} actor={actor} />
          {pending > 0 && (
            <Notice tone="warn" className="mt-4">
              {pending} field(s) still unreviewed. You can continue, but unreviewed values are not
              used to fill the application and will be reported by the checks.
            </Notice>
          )}
          <Notice className="mt-4">
            The application form is optional. Continuing fills the application from the fields you
            confirmed.{' '}
            <button
              type="button"
              className="text-primary font-semibold underline"
              onClick={() => {
                go(3);
              }}
            >
              Open the application form
            </button>
          </Notice>
          <StepNav
            onBack={() => {
              go(1);
            }}
            onSave={saveDraft}
            onNext={() => {
              continueFromExtract(app);
            }}
            nextLabel="Continue to risk analysis"
          />
        </>
      )}
      {step === 3 && (
        <ReviewStep
          key={formKey}
          app={app ?? unsavedApplication(defaultBranch)}
          docs={docs}
          db={db}
          actor={actor}
          ensureApp={ensureApp}
          requireCoreFields={path === 'form'}
          {...(path === 'upload'
            ? {
                onBack: () => {
                  go(2);
                },
              }
            : {})}
          onContinue={(id) => {
            go(4, id);
          }}
          onAttach={() => {
            switchTo('upload');
          }}
        />
      )}
      {step === 4 && app !== null && (
        <RiskStep
          app={app}
          db={db}
          actor={actor}
          onBack={() => {
            go(3);
          }}
          onSubmit={() => {
            submitApplication(app.id, actor);
            toast.push({
              tone: 'success',
              title: `${app.id} submitted for review`,
              detail: 'Status set to “Needs review”. No decision has been made.',
              action: {
                label: 'Open application',
                onClick: () => {
                  void navigate(`/applications/${app.id}`);
                },
              },
            });
            void navigate(`/applications/${app.id}`);
          }}
        />
      )}
      {(step === 2 || step === 4) && app === null && (
        <Card>
          <EmptyState
            icon={FileQuestion}
            title="Start the application"
            action={
              <Button
                onClick={() => {
                  switchTo('form');
                }}
              >
                Go to the application form
              </Button>
            }
          >
            Fill the application form or add a document first.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
